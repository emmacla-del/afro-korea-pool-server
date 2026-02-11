import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CatalogService {
  constructor(private prisma: PrismaService) {}

  private async getSupplierIdForUser(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { supplier: true },
    });

    if (!user) throw new NotFoundException('User not found');
    if (user.role !== 'SUPPLIER' || !user.supplier) {
      throw new ForbiddenException('Not a supplier');
    }
    return user.supplier.id;
  }

  async listPublicProducts() {
    const products = await this.prisma.product.findMany({
      where: {
        isActive: true,
        supplier: {
          owner: {
            role: 'SUPPLIER',
          },
        },
      },
      include: {
        supplier: {
          select: { id: true, displayName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    if (products.length === 0) return [];

    const productIds = products.map((p) => p.id);

    const variants = await this.prisma.productVariant.findMany({
      where: {
        productId: { in: productIds },
        isActive: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const variantsByProductId = new Map<string, any[]>();
    for (const v of variants) {
      const list = variantsByProductId.get(v.productId) ?? [];
      list.push(v);
      variantsByProductId.set(v.productId, list);
    }

    const variantIds = variants.map((v) => v.id);

    const pools =
      variantIds.length === 0
        ? []
        : await this.prisma.pool.findMany({
            where: {
              variantId: { in: variantIds },
              status: {
                in: ['OPEN', 'PAYMENT_WINDOW', 'EXPIRED', 'FAILED_PAYMENT', 'PURCHASED'],
              },
            },
            distinct: ['variantId'],
            orderBy: { createdAt: 'desc' },
          });

    const poolByVariantId = new Map<string, any>();
    for (const p of pools) {
      poolByVariantId.set(p.variantId, {
        id: p.id,
        status: p.status,
        committedQty: p.committedQty,
        thresholdQtySnapshot: p.thresholdQtySnapshot,
        deadlineAt: p.deadlineAt,
        paymentWindowEndsAt: p.paymentWindowEndsAt,
      });
    }

    return products.map((p) => {
      const vars = variantsByProductId.get(p.id) ?? [];
      return {
        id: p.id,
        supplierId: p.supplierId,
        title: p.title,
        description: p.description,
        category: p.category,
        isActive: p.isActive,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        supplier: { id: p.supplier.id, displayName: p.supplier.displayName },
        variants: vars.map((v) => ({
          ...v,
          pools: poolByVariantId.has(v.id) ? [poolByVariantId.get(v.id)] : [],
        })),
      };
    });
  }

  async listSupplierProducts(userId: string) {
    const supplierId = await this.getSupplierIdForUser(userId);
    const products = await this.prisma.product.findMany({
      where: { supplierId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    if (products.length === 0) return [];

    const productIds = products.map((p) => p.id);
    const variants = await this.prisma.productVariant.findMany({
      where: { productId: { in: productIds } },
      orderBy: { createdAt: 'desc' },
    });

    const variantsByProductId = new Map<string, any[]>();
    for (const v of variants) {
      const list = variantsByProductId.get(v.productId) ?? [];
      list.push(v);
      variantsByProductId.set(v.productId, list);
    }

    return products.map((p) => ({ ...p, variants: variantsByProductId.get(p.id) ?? [] }));
  }

  async createProduct(
    userId: string,
    input: { title: string; description?: string; category?: string },
  ) {
    const supplierId = await this.getSupplierIdForUser(userId);
    const created = await this.prisma.product.create({
      data: {
        id: randomUUID(),
        supplierId,
        title: input.title,
        description: input.description ?? null,
        category: input.category ?? null,
        isActive: true,
      },
    });
    return created;
  }

  async createVariant(
    userId: string,
    input: {
      productId: string;
      sku: string;
      unitPriceXaf: number;
      thresholdQty: number;
      leadTimeDays?: number;
    },
  ) {
    const supplierId = await this.getSupplierIdForUser(userId);
    const product = await this.prisma.product.findUnique({
      where: { id: input.productId },
    });
    if (!product) throw new NotFoundException('Product not found');
    if (product.supplierId !== supplierId) throw new ForbiddenException('Not your product');

    try {
      const created = await this.prisma.productVariant.create({
        data: {
          id: randomUUID(),
          productId: input.productId,
          sku: input.sku,
          unitPriceXaf: input.unitPriceXaf,
          thresholdQty: input.thresholdQty,
          leadTimeDays: input.leadTimeDays ?? 14,
          isActive: true,
        },
      });
      return created;
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw new BadRequestException('SKU must be globally unique');
      }
      throw err;
    }
  }

  async importCatalog(
    userId: string,
    input: {
      products: Array<{
        title: string;
        description?: string;
        category?: string;
        variants: Array<{
          sku: string;
          unitPriceXaf: number;
          thresholdQty: number;
          leadTimeDays?: number;
        }>;
      }>;
    },
  ) {
    const supplierId = await this.getSupplierIdForUser(userId);

    const results: Array<{ productId: string; createdVariants: number }> = [];
    const errors: Array<{ productTitle: string; error: string }> = [];

    for (const productInput of input.products) {
      try {
        const created = await this.prisma.$transaction(async (tx) => {
          const productId = randomUUID();
          const product = await tx.product.create({
            data: {
              id: productId,
              supplierId,
              title: productInput.title,
              description: productInput.description ?? null,
              category: productInput.category ?? null,
              isActive: true,
            },
          });

          const variants = productInput.variants;
          if (variants.length === 0) {
            throw new BadRequestException('Product must have at least one variant');
          }

          await tx.productVariant.createMany({
            data: variants.map((v) => ({
              id: randomUUID(),
              productId: product.id,
              sku: v.sku,
              unitPriceXaf: v.unitPriceXaf,
              thresholdQty: v.thresholdQty,
              leadTimeDays: v.leadTimeDays ?? 14,
              isActive: true,
            })),
          });

          return { id: productId };
        });

        results.push({ productId: created.id, createdVariants: productInput.variants.length });
      } catch (err: any) {
        const message = typeof err?.message === 'string' ? err.message : 'Unknown error';
        if (err?.code === 'P2002' || (message.toLowerCase().includes('unique') && message.toLowerCase().includes('sku'))) {
          errors.push({
            productTitle: productInput.title,
            error: 'SKU must be globally unique; one of the variant SKUs already exists.',
          });
        } else {
          errors.push({ productTitle: productInput.title, error: message });
        }
      }
    }

    if (results.length === 0) {
      throw new BadRequestException({ message: 'No products imported', errors });
    }

    return { imported: results, errors };
  }
}

