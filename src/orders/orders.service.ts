import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  CommitmentStatus,
  OrderStatus,
  PaymentStatus,
  PoolStatus,
  PurchaseOrderSource,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) { }

  async createDirectOrder(input: { userId: string; variantId: string; qty: number }) {
    if (input.qty <= 0) throw new BadRequestException('qty must be > 0');

    const variant = await this.prisma.productVariant.findUnique({
      where: { id: input.variantId },
      include: { product: true },
    });
    if (!variant) throw new NotFoundException('Variant not found');
    if (!variant.isActive || !variant.product.isActive) {
      throw new BadRequestException('Variant or product is inactive');
    }

    const supplierId = variant.product.supplierId;
    const unitPriceXaf = variant.unitPriceXaf;
    const amountXaf = unitPriceXaf * input.qty;

    return this.prisma.order.create({
      data: {
        userId: input.userId,
        supplierId,
        variantId: variant.id,
        qty: input.qty,
        unitPriceXaf,
        amountXaf,
      },
    });
  }

  async listOrdersForUser(userId: string) {
    return this.prisma.order.findMany({
      where: { userId },
      include: {
        pool: true,
        payments: true,
        variant: { include: { product: true } },
        purchaseOrder: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async getOrderForUser(input: { userId: string; orderId: string }) {
    const order = await this.prisma.order.findFirst({
      where: { id: input.orderId, userId: input.userId },
      include: {
        pool: true,
        payments: true,
        variant: { include: { product: true } },
        purchaseOrder: true,
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async devMarkOrderPaid(orderId: string) {
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`;

      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: {
          commitment: { include: { pool: { include: { purchaseOrder: true } } } },
          pool: { include: { purchaseOrder: true } },
          variant: { include: { product: true } },
        },
      });
      if (!order) throw new NotFoundException('Order not found');

      if (order.status === OrderStatus.PAID) return order;

      const updatedOrder = await tx.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.PAID },
      });

      await tx.payment.create({
        data: {
          orderId: order.id,
          provider: 'DEV',
          providerRef: `${order.id}:${now.toISOString()}`,
          status: PaymentStatus.SUCCEEDED,
          amountXaf: order.amountXaf,
        },
      });

      if (order.commitmentId && order.commitment) {
        await tx.commitment.update({
          where: { id: order.commitment.id },
          data: { status: CommitmentStatus.PAID },
        });
      }

      if (order.poolId) {
        const updatedPool = await tx.pool.update({
          where: { id: order.poolId },
          data: { paidQty: { increment: order.qty } },
        });

        const existingPo = order.pool?.purchaseOrder ?? null;
        if (
          updatedPool.status === PoolStatus.PAYMENT_WINDOW &&
          updatedPool.paidQty >= updatedPool.thresholdQtySnapshot &&
          !existingPo
        ) {
          await tx.pool.update({
            where: { id: updatedPool.id },
            data: { status: PoolStatus.PURCHASED },
          });

          // 👇 Ensure variantId is not null before creating purchase order
          if (!updatedPool.variantId) {
            throw new Error('Cannot create purchase order for pool: variantId is null');
          }

          await tx.purchaseOrder.create({
            data: {
              supplierId: order.supplierId,
              source: PurchaseOrderSource.POOL,
              poolId: updatedPool.id,
              items: {
                create: [
                  {
                    variantId: updatedPool.variantId,
                    qty: updatedPool.paidQty,
                    unitPriceXaf: updatedPool.unitPriceXafSnapshot,
                  },
                ],
              },
              events: { create: [{ status: 'CREATED', note: 'Auto-created after enough payments' }] },
            },
          });
        }
      } else {
        // Direct purchase
        const existingPo = await tx.purchaseOrder.findFirst({ where: { directOrderId: order.id } });
        if (!existingPo) {
          // 👇 Ensure variantId is not null before creating purchase order
          if (!order.variantId) {
            throw new Error('Cannot create purchase order for direct order: variantId is null');
          }

          await tx.purchaseOrder.create({
            data: {
              supplierId: order.supplierId,
              source: PurchaseOrderSource.DIRECT,
              directOrderId: order.id,
              items: {
                create: [
                  {
                    variantId: order.variantId,
                    qty: order.qty,
                    unitPriceXaf: order.unitPriceXaf,
                  },
                ],
              },
              events: { create: [{ status: 'CREATED', note: 'Auto-created from direct order payment' }] },
            },
          });
        }
      }

      return updatedOrder;
    });
  }
}