import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CommitmentStatus, OrderStatus, PoolStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_PAYMENT_WINDOW_MINUTES = 24 * 60;

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

@Injectable()
export class PoolsService {
  constructor(private readonly prisma: PrismaService) {}

  async createPool(input: { variantId: string; deadlineAt: Date }) {
    const now = new Date();
    const maxDeadlineTime = now.getTime() + 90 * 24 * 60 * 60 * 1000; // 90 days
    
    if (input.deadlineAt.getTime() <= now.getTime()) {
      throw new BadRequestException('deadlineAt must be in the future');
    }

    // FIXED: Issue #12 - Prevent absurdly far deadlines (e.g., 973 years in future)
    if (input.deadlineAt.getTime() > maxDeadlineTime) {
      throw new BadRequestException(
        `deadlineAt cannot exceed 90 days from now. Max: ${new Date(maxDeadlineTime).toISOString()}`,
      );
    }

    const variant = await this.prisma.productVariant.findUnique({
      where: { id: input.variantId },
      include: { product: true },
    });
    if (!variant) {
      throw new NotFoundException('Variant not found');
    }
    if (!variant.isActive || !variant.product.isActive) {
      throw new BadRequestException('Variant or product is inactive');
    }

    return this.prisma.pool.create({
      data: {
        variantId: variant.id,
        thresholdQtySnapshot: variant.thresholdQty,
        unitPriceXafSnapshot: variant.unitPriceXaf,
        deadlineAt: input.deadlineAt,
      },
    });
  }

  async getPool(poolId: string) {
    const pool = await this.prisma.pool.findUnique({
      where: { id: poolId },
      include: {
        variant: { include: { product: { include: { supplier: true } } } },
      },
    });
    if (!pool) throw new NotFoundException('Pool not found');
    return pool;
  }

  async commitToPool(input: { poolId: string; userId: string; qty: number }) {
    // FIXED: Issue #12 - Validate quantity is non-negative
    if (input.qty < 0) {
      throw new BadRequestException('qty must be >= 0');
    }

    const paymentWindowMinutes = Number(process.env.PAYMENT_WINDOW_MINUTES ?? DEFAULT_PAYMENT_WINDOW_MINUTES);
    if (!Number.isFinite(paymentWindowMinutes) || paymentWindowMinutes <= 0) {
      throw new BadRequestException('Invalid PAYMENT_WINDOW_MINUTES');
    }

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Pool" WHERE "id" = ${input.poolId} FOR UPDATE`;

      const pool = await tx.pool.findUnique({
        where: { id: input.poolId },
        include: { commitments: true, variant: { include: { product: true } } },
      });
      if (!pool) throw new NotFoundException('Pool not found');

      if (pool.status !== PoolStatus.OPEN || pool.lockedAt) {
        throw new ConflictException('Pool is locked');
      }
      if (pool.deadlineAt.getTime() <= now.getTime()) {
        throw new ConflictException('Pool deadline has passed');
      }

      const existing = await tx.commitment.findUnique({
        where: { poolId_userId: { poolId: input.poolId, userId: input.userId } },
      });

      const previousQty = existing?.status === CommitmentStatus.ACTIVE ? existing.qty : 0;
      let nextCommittedQty = pool.committedQty;

      if (input.qty === 0) {
        if (existing && existing.status === CommitmentStatus.ACTIVE) {
          nextCommittedQty -= previousQty;
          await tx.commitment.update({
            where: { id: existing.id },
            data: { status: CommitmentStatus.CANCELED, qty: 0 },
          });
        }
      } else {
        const delta = input.qty - previousQty;
        nextCommittedQty += delta;

        // FIXED: Issue #12 - CRITICAL: Prevent overcommitting beyond MOQ threshold
        if (nextCommittedQty > pool.thresholdQtySnapshot) {
          const available = Math.max(0, pool.thresholdQtySnapshot - pool.committedQty + previousQty);
          throw new BadRequestException(
            `Cannot commit ${input.qty} items. Pool would have ${nextCommittedQty} items, ` +
            `but threshold is ${pool.thresholdQtySnapshot}. Maximum available: ${available}`,
          );
        }

        await tx.commitment.upsert({
          where: { poolId_userId: { poolId: input.poolId, userId: input.userId } },
          create: {
            poolId: input.poolId,
            userId: input.userId,
            qty: input.qty,
            status: CommitmentStatus.ACTIVE,
          },
          update: {
            qty: input.qty,
            status: CommitmentStatus.ACTIVE,
          },
        });
      }

      if (nextCommittedQty < 0) nextCommittedQty = 0;

      const updatedPool = await tx.pool.update({
        where: { id: pool.id },
        data: { committedQty: nextCommittedQty },
      });

      if (nextCommittedQty >= pool.thresholdQtySnapshot) {
        const paymentWindowEndsAt = addMinutes(now, paymentWindowMinutes);

        const lockedPool = await tx.pool.update({
          where: { id: pool.id },
          data: {
            status: PoolStatus.PAYMENT_WINDOW,
            lockedAt: now,
            paymentWindowEndsAt,
          },
        });

        const activeCommitments = await tx.commitment.findMany({
          where: { poolId: pool.id, status: CommitmentStatus.ACTIVE },
          select: { id: true, userId: true, qty: true },
        });

        await tx.order.createMany({
          data: activeCommitments.map((commitment) => ({
            userId: commitment.userId,
            supplierId: pool.variant.product.supplierId,
            variantId: pool.variantId,
            qty: commitment.qty,
            poolId: pool.id,
            commitmentId: commitment.id,
            unitPriceXaf: lockedPool.unitPriceXafSnapshot,
            amountXaf: commitment.qty * lockedPool.unitPriceXafSnapshot,
          })),
          skipDuplicates: true,
        });

        return lockedPool;
      }

      return updatedPool;
    });
  }

  async finalizePoolIfNeeded(poolId: string) {
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Pool" WHERE "id" = ${poolId} FOR UPDATE`;

      const pool = await tx.pool.findUnique({
        where: { id: poolId },
        include: { variant: { include: { product: true } }, purchaseOrder: true },
      });
      if (!pool) throw new NotFoundException('Pool not found');
      if (pool.status !== PoolStatus.PAYMENT_WINDOW || !pool.paymentWindowEndsAt) return pool;
      if (pool.paymentWindowEndsAt.getTime() > now.getTime()) return pool;

      if (pool.paidQty < pool.thresholdQtySnapshot) {
        await tx.order.updateMany({
          where: { poolId: pool.id, status: { not: OrderStatus.PAID } },
          data: { status: OrderStatus.CANCELED },
        });
        await tx.commitment.updateMany({
          where: { poolId: pool.id, status: CommitmentStatus.ACTIVE },
          data: { status: CommitmentStatus.EXPIRED },
        });
        return tx.pool.update({
          where: { id: pool.id },
          data: { status: PoolStatus.FAILED_PAYMENT },
        });
      }

      if (pool.purchaseOrder) {
        return tx.pool.update({ where: { id: pool.id }, data: { status: PoolStatus.PURCHASED } });
      }

      const supplierId = pool.variant.product.supplierId;
      const purchasedPool = await tx.pool.update({
        where: { id: pool.id },
        data: { status: PoolStatus.PURCHASED },
      });

      await tx.purchaseOrder.create({
        data: {
          supplierId,
          poolId: pool.id,
          items: {
            create: [
              {
                variantId: pool.variantId,
                qty: pool.paidQty,
                unitPriceXaf: pool.unitPriceXafSnapshot,
              },
            ],
          },
          events: { create: [{ status: 'CREATED', note: 'Auto-created from successful pool' }] },
        },
      });

      await tx.commitment.updateMany({
        where: { poolId: pool.id, status: CommitmentStatus.ACTIVE },
        data: { status: CommitmentStatus.EXPIRED },
      });
      await tx.order.updateMany({
        where: { poolId: pool.id, status: { not: OrderStatus.PAID } },
        data: { status: OrderStatus.CANCELED },
      });

      return purchasedPool;
    });
  }

  async expirePoolIfPastDeadline(poolId: string) {
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Pool" WHERE "id" = ${poolId} FOR UPDATE`;

      const pool = await tx.pool.findUnique({ where: { id: poolId } });
      if (!pool) throw new NotFoundException('Pool not found');
      if (pool.status !== PoolStatus.OPEN || pool.lockedAt) return pool;
      if (pool.deadlineAt.getTime() > now.getTime()) return pool;
      if (pool.committedQty >= pool.thresholdQtySnapshot) return pool;

      await tx.commitment.updateMany({
        where: { poolId: pool.id, status: CommitmentStatus.ACTIVE },
        data: { status: CommitmentStatus.EXPIRED },
      });

      return tx.pool.update({
        where: { id: pool.id },
        data: { status: PoolStatus.EXPIRED },
      });
    });
  }
}
