import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PoolStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { join } from 'path';
import { mkdir, writeFile } from 'fs/promises';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CatalogService {
  constructor(private prisma: PrismaService) { }

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

  // ==================== NEW: Product creation with images ====================
  async createProductWithImages(
    userId: string,
    data: {
      product_name: string;
      description?: string;
      sku: string;
      price: number;
      stock: number;
      currency: string;
    },
    files: Array<{ buffer: Buffer; filename: string; mimetype: string }>,
  ) {
    const supplierId = await this.getSupplierIdForUser(userId);

    // 🔐 Verify supplier is verified
    const supplier = await this.prisma.supplier.findUnique({
      where: { id: supplierId },
      select: { verificationStatus: true },
    });
    if (!supplier || supplier.verificationStatus !== 'VERIFIED') {
      throw new ForbiddenException('Your account must be verified to create products');
    }

    // Ensure upload directory exists
    const uploadDir = join(process.cwd(), 'uploads', 'products');
    await mkdir(uploadDir, { recursive: true });

    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          id: randomUUID(),
          supplierId,
          title: data.product_name,
          description: data.description ?? null,
        },
      });

      await tx.productVariant.create({
        data: {
          id: randomUUID(),
          productId: product.id,
          sku: data.sku,
          unitPriceXaf: Math.round(data.price),
          thresholdQty: data.stock,
          leadTimeDays: 14,
          isActive: true,
        },
      });

      if (files && files.length > 0) {
        const imageData = await Promise.all(
          files.map(async (file) => {
            const filename = `${randomUUID()}-${file.filename}`;
            const filePath = join(uploadDir, filename);
            await writeFile(filePath, file.buffer);
            return {
              id: randomUUID(),
              productId: product.id,
              url: `/uploads/products/${filename}`,
              order: null,
            };
          }),
        );
        await tx.image.createMany({ data: imageData });
      }

      return product;
    });
  }
  // ============================================================================

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
          select: {
            id: true,
            displayName: true,
            country: true,
            verificationStatus: true,
          },
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
        supplier: {
          id: p.supplier.id,
          displayName: p.supplier.displayName,
          country: p.supplier.country,
          verificationStatus: p.supplier.verificationStatus,
        },
        variants: vars.map((v) => ({
          ...v,
          pools: poolByVariantId.has(v.id) ? [poolByVariantId.get(v.id)] : [],
        })),
      };
    });
  }

  async listSupplierProducts(userId: string) {
    const supplierId = await this.getSupplierIdForUser(userId);
    return this.fetchSupplierProductsWithVariants(supplierId);
  }

  private async fetchSupplierProductsWithVariants(supplierId: string) {
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

    const variantsByProductId = new Map<string, any[]>();
    for (const v of variants) {
      const list = variantsByProductId.get(v.productId) ?? [];
      list.push({
        ...v,
        pools: poolByVariantId.has(v.id) ? [poolByVariantId.get(v.id)] : [],
      });
      variantsByProductId.set(v.productId, list);
    }

    return products.map((p) => ({
      ...p,
      variants: variantsByProductId.get(p.id) ?? [],
    }));
  }

  async getSupplierProductsSummary(userId: string) {
    const supplierId = await this.getSupplierIdForUser(userId);

    const [total, openPool] = await this.prisma.$transaction([
      this.prisma.product.count({
        where: { supplierId },
      }),
      this.prisma.pool.count({
        where: {
          status: { in: [PoolStatus.OPEN, PoolStatus.PAYMENT_WINDOW] },
          variant: {
            product: { supplierId },
          },
        },
      }),
    ]);

    return { total, openPool };
  }

  async getLatestCatalogImport(userId: string) {
    const supplierId = await this.getSupplierIdForUser(userId);

    const latest = await this.prisma.product.findFirst({
      where: { supplierId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    return { lastImportedAt: latest?.createdAt ?? null };
  }

  async createProduct(
    userId: string,
    input: { product_name: string; description?: string; category?: string },
  ) {
    const supplierId = await this.getSupplierIdForUser(userId);
    // Optionally also check verification here if you want
    return this.prisma.product.create({
      data: {
        id: randomUUID(),
        supplierId,
        title: input.product_name,
        description: input.description ?? null,
        category: input.category ?? null,
        isActive: true,
      },
    });
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

  async updateSupplierProduct(
    userId: string,
    productId: string,
    input: { name?: string; price?: number; stock?: number; isActive?: boolean },
  ) {
    const supplierId = await this.getSupplierIdForUser(userId);
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, supplierId: true },
    });
    if (!product) throw new NotFoundException('Product not found');
    if (product.supplierId !== supplierId) throw new ForbiddenException('Not your product');

    if (input.name !== undefined || input.isActive !== undefined) {
      const data: { title?: string; isActive?: boolean } = {};
      if (input.name !== undefined) data.title = input.name;
      if (input.isActive !== undefined) data.isActive = input.isActive;
      await this.prisma.product.update({ where: { id: productId }, data });
    }

    if (input.price !== undefined || input.stock !== undefined) {
      const targetVariant = await this.prisma.productVariant.findFirst({
        where: { productId },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      if (!targetVariant) {
        throw new BadRequestException('No variant found for this product');
      }
      const data: { unitPriceXaf?: number; thresholdQty?: number } = {};
      if (input.price !== undefined) data.unitPriceXaf = Math.round(input.price);
      if (input.stock !== undefined) data.thresholdQty = input.stock;
      await this.prisma.productVariant.update({ where: { id: targetVariant.id }, data });
    }

    return this.getSupplierProductById(supplierId, productId);
  }

  async updateSupplierProductPoolStatus(
    userId: string,
    productId: string,
    poolStatus: 'OPEN' | 'CLOSED',
  ) {
    const supplierId = await this.getSupplierIdForUser(userId);
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, supplierId: true },
    });
    if (!product) throw new NotFoundException('Product not found');
    if (product.supplierId !== supplierId) throw new ForbiddenException('Not your product');

    const variant = await this.prisma.productVariant.findFirst({
      where: { productId },
      orderBy: { createdAt: 'desc' },
    });
    if (!variant) throw new BadRequestException('No variant found for this product');

    if (poolStatus === 'CLOSED') {
      await this.prisma.pool.updateMany({
        where: {
          variantId: variant.id,
          status: { in: [PoolStatus.OPEN, PoolStatus.PAYMENT_WINDOW] },
        },
        data: { status: PoolStatus.EXPIRED },
      });
    } else {
      const existingOpenPool = await this.prisma.pool.findFirst({
        where: {
          variantId: variant.id,
          status: { in: [PoolStatus.OPEN, PoolStatus.PAYMENT_WINDOW] },
        },
      });

      if (!existingOpenPool) {
        const now = new Date();
        const deadlineAt = new Date(now.getTime() + 72 * 60 * 60 * 1000);
        await this.prisma.pool.create({
          data: {
            id: randomUUID(),
            variantId: variant.id,
            status: PoolStatus.OPEN,
            thresholdQtySnapshot: variant.thresholdQty,
            unitPriceXafSnapshot: variant.unitPriceXaf,
            deadlineAt,
          },
        });
      }
    }

    return this.getSupplierProductById(supplierId, productId);
  }

  private async getSupplierProductById(supplierId: string, productId: string) {
    const products = await this.fetchSupplierProductsWithVariants(supplierId);
    const product = products.find((p) => p.id === productId);
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async importCatalog(
    userId: string,
    input: {
      products: Array<{
        product_name: string;
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
              title: productInput.product_name,
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
            productTitle: productInput.product_name,
            error: 'SKU must be globally unique; one of the variant SKUs already exists.',
          });
        } else {
          errors.push({ productTitle: productInput.product_name, error: message });
        }
      }
    }

    if (results.length === 0) {
      throw new BadRequestException({ message: 'No products imported', errors });
    }

    return { imported: results, errors };
  }
}