// src/catalog/catalog.service.ts
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PoolStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../common/cache/cache.service';
import { ProductService } from '../product/product.service';
import { DealService } from '../deal/deal.service';
import { v2 as cloudinary } from 'cloudinary';

@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name);

  constructor(
    private prisma: PrismaService,
    private cacheService: CacheService,
    private productService: ProductService,
    private dealService: DealService,
  ) { }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async getSupplierIdForUser(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { supplier: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== 'SUPPLIER' || !user.supplier) {
      throw new ForbiddenException('User is not registered as a supplier');
    }
    return user.supplier.id;
  }

  private generateSku(): string {
    return `SKU-${Date.now().toString(36).toUpperCase()}-${Math.random()
      .toString(36)
      .substring(2, 9)
      .toUpperCase()}`;
  }

  /**
   * Resolve a category name to its ID. If the name doesn't exist, return undefined.
   */
  private async getCategoryIdByName(name?: string): Promise<string | undefined> {
    if (!name) return undefined;
    const category = await this.prisma.category.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
    });
    return category?.id;
  }

  // ── Cloudinary ─────────────────────────────────────────────────────────────

  private async uploadToCloudinary(buffer: Buffer, filename: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'afropool/products',
          public_id: `${randomUUID()}-${filename.split('.')[0]}`,
          transformation: [
            {
              width: 800,
              height: 800,
              crop: 'pad',
              background: 'white',
              gravity: 'center',
            },
            { quality: 'auto:best', fetch_format: 'auto', effect: 'sharpen:60' },
          ],
        },
        (error, result) => {
          if (error || !result) reject(error || new Error('Upload failed'));
          else resolve(result.secure_url);
        },
      );
      uploadStream.end(buffer);
    });
  }

  private normaliseImageUrl(url: string): string {
    if (!url || !url.includes('cloudinary.com') || url.includes('/upload/w_800')) return url;
    return url.replace(
      '/upload/',
      '/upload/w_800,h_800,c_pad,b_white,g_center,q_auto:best,f_auto,e_sharpen:60/',
    );
  }

  // ── Write Operations ────────────────────────────────────────────────────────

  /**
   * Create a new product with images, and optionally create a team deal pool.
   */
  async createProductWithImages(
    userId: string,
    data: {
      product_name: string;
      description?: string;
      price: number;
      stock: number;
      category?: string;                 // category name (from frontend)
      categoryId?: string;               // category UUID (preferred over name lookup)
      teamPrice?: number;                // optional team price
      minBuyers?: number;                // optional min buyers
      teamDealNeighbourhoodId?: string;  // optional neighbourhood for the deal
    },
    files: Array<{ buffer: Buffer; filename: string; mimetype: string }>,
  ) {
    const supplierId = await this.getSupplierIdForUser(userId);

    // Prefer explicit UUID; fall back to name lookup for legacy clients
    const categoryId = data.categoryId ?? await this.getCategoryIdByName(data.category);

    // Upload images to Cloudinary
    const uploadedUrls = await Promise.all(
      files.map((file) => this.uploadToCloudinary(file.buffer, file.filename)),
    );

    const roundedPrice = Math.round(data.price);

    const result = await this.prisma.$transaction(async (tx) => {
      const productId = randomUUID();

      // 1. Create product (including team deal fields)
      const product = await tx.product.create({
        data: {
          id: productId,
          supplierId,
          title: data.product_name,
          description: data.description,
          categoryId,
          minPrice: roundedPrice,
          isActive: true,
          teamPrice: data.teamPrice,
          minBuyers: data.minBuyers,
          teamDealNeighbourhoodId: data.teamDealNeighbourhoodId,
          variants: {
            create: {
              id: randomUUID(),
              sku: this.generateSku(),
              unitPriceXaf: roundedPrice,
              thresholdQty: data.stock,
              leadTimeDays: 14,
              isActive: true,
            },
          },
          images: {
            create: uploadedUrls.map((url, index) => ({
              id: randomUUID(),
              url,
              order: index,
            })),
          },
          stats: {
            create: { score: 0, views: 0, likes: 0, shares: 0 },
          },
        },
        include: { variants: true, images: true, stats: true },
      });

      // 2. If team deal fields are present, create a Pool record
      if (data.teamPrice && data.minBuyers) {
        const variant = product.variants[0];
        if (variant) {
          await tx.pool.create({
            data: {
              variantId: variant.id,
              productId: product.id,
              dealType: 'TEAM_DEAL',
              status: 'OPEN',
              minBuyers: data.minBuyers,
              teamPrice: data.teamPrice,
              unitPriceXafSnapshot: data.price,
              thresholdQtySnapshot: data.minBuyers,
              committedQty: 0,
              neighbourhoodId: data.teamDealNeighbourhoodId,
              deadlineAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
            },
          });
        }
      }

      return product;
    });

    // Invalidate caches
    await this.cacheService.delPatterns('products:*', 'home:feed:*', 'home:categories');

    return result;
  }

  async updateSupplierProduct(
    userId: string,
    productId: string,
    input: {
      name?: string;
      price?: number;
      stock?: number;
      isActive?: boolean;
      categoryId?: string;
    },
  ) {
    const supplierId = await this.getSupplierIdForUser(userId);

    // Check ownership first
    const product = await this.prisma.product.findFirst({
      where: { id: productId, supplierId },
    });
    if (!product) throw new ForbiddenException('Product not found or access denied');

    await this.prisma.$transaction(async (tx) => {
      // 1. Update core product fields
      if (input.name !== undefined || input.isActive !== undefined || input.categoryId !== undefined) {
        await tx.product.update({
          where: { id: productId },
          data: {
            title: input.name,
            isActive: input.isActive,
            categoryId: input.categoryId,
          },
        });
      }

      // 2. Update variant and sync minPrice
      if (input.price !== undefined || input.stock !== undefined) {
        const variant = await tx.productVariant.findFirst({
          where: { productId },
          orderBy: { createdAt: 'desc' },
        });

        if (variant) {
          const newPrice = input.price ? Math.round(input.price) : variant.unitPriceXaf;
          await tx.productVariant.update({
            where: { id: variant.id },
            data: {
              unitPriceXaf: newPrice,
              thresholdQty: input.stock ?? undefined,
            },
          });

          await tx.product.update({
            where: { id: productId },
            data: { minPrice: newPrice },
          });
        }
      }
    });

    await this.cacheService.delPatterns(`product:${productId}`, 'products:*', 'home:feed:*');
    return { success: true };
  }

  async createVariant(
    userId: string,
    input: {
      productId: string;
      sku?: string;
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

    const sku = input.sku ?? this.generateSku();

    try {
      const variant = await this.prisma.productVariant.create({
        data: {
          id: randomUUID(),
          productId: input.productId,
          sku,
          unitPriceXaf: input.unitPriceXaf,
          thresholdQty: input.thresholdQty,
          leadTimeDays: input.leadTimeDays ?? 14,
          isActive: true,
        },
      });

      // Recalculate minPrice across all active variants
      await this.productService.updateMinPrice(input.productId);

      await this.cacheService.delPatterns(`product:${input.productId}`, 'products:*', 'home:feed:*');
      return variant;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException('SKU already exists');
      }
      throw err;
    }
  }

  async importCatalog(
    userId: string,
    input: {
      products: Array<{
        product_name: string;
        description?: string;
        categoryId?: string;
        variants: Array<{
          sku?: string;
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
          if (productInput.variants.length === 0) {
            throw new BadRequestException('Product must have at least one variant');
          }

          const productId = randomUUID();
          const product = await tx.product.create({
            data: {
              id: productId,
              supplierId,
              title: productInput.product_name,
              description: productInput.description ?? null,
              categoryId: productInput.categoryId,
              isActive: true,
            },
          });

          const variantData = productInput.variants.map((v) => ({
            id: randomUUID(),
            productId: product.id,
            sku: v.sku ?? this.generateSku(),
            unitPriceXaf: v.unitPriceXaf,
            thresholdQty: v.thresholdQty,
            leadTimeDays: v.leadTimeDays ?? 14,
            isActive: true,
          }));

          await tx.productVariant.createMany({ data: variantData });

          const minPrice = Math.min(...variantData.map((v) => v.unitPriceXaf));
          await tx.product.update({
            where: { id: product.id },
            data: { minPrice },
          });

          await tx.productStats.create({
            data: { productId: product.id, score: 0, views: 0, likes: 0, shares: 0 },
          });

          return { id: product.id };
        });

        results.push({
          productId: created.id,
          createdVariants: productInput.variants.length,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        const isSkuCollision = err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

        errors.push({
          productTitle: productInput.product_name,
          error: isSkuCollision ? 'SKU must be globally unique.' : message,
        });
      }
    }

    if (results.length === 0) throw new BadRequestException({ message: 'No products imported', errors });

    await this.cacheService.delPatterns('products:*', 'home:feed:*', 'home:categories');
    return { imported: results, errors };
  }

  // ── Read Operations ─────────────────────────────────────────────────────────

  async findOne(productId: string, userId?: string) {
    const product = await this.productService.getProductById(productId, userId);

    // Explicitly type 'variant' as any to satisfy the compiler
    const variantIds = (product.variants ?? []).map((variant: any) => variant.id);

    const pools = await this.dealService.getPoolsForVariants(variantIds);
    this.dealService.attachPoolsToVariants(product.variants ?? [], pools);

    return {
      ...product,
      images: (product.images ?? []).map((image: any) => this.normaliseImageUrl(image.url)),
      variants: product.variants ?? [],
    };
  }

  async listSupplierProducts(userId: string) {
    const supplierId = await this.getSupplierIdForUser(userId);

    const products = await this.prisma.product.findMany({
      where: { supplierId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        images: { orderBy: { order: 'asc' } },
        category_: true, // Corrected from 'category'
        variants: {
          include: {
            pools: {
              where: { status: { in: ['OPEN', 'PAYMENT_WINDOW'] } },
            },
          },
        },
      },
    });

    return products.map((p) => ({
      ...p,
      images: p.images.map((img) => this.normaliseImageUrl(img.url)),
    }));
  }

  async listPublicProducts() {
    // Public product listing for customers
    return this.productService.getProducts({ skip: 0, take: 50, useCache: true });
  }

  async getSupplierProductsSummary(userId: string) {
    const supplierId = await this.getSupplierIdForUser(userId);

    const [activeCount, totalCount] = await Promise.all([
      this.prisma.product.count({ where: { supplierId, isActive: true } }),
      this.prisma.product.count({ where: { supplierId } }),
    ]);

    return {
      supplierId,
      activeProducts: activeCount,
      totalProducts: totalCount,
    };
  }

  async getLatestCatalogImport(userId: string) {
    const supplierId = await this.getSupplierIdForUser(userId);

    // If no dedicated catalog import history table exists, reuse latest product record.
    const latest = await this.prisma.product.findFirst({
      where: { supplierId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true, createdAt: true },
    });

    return latest;
  }

  async updateSupplierProductPoolStatus(userId: string, productId: string, status: 'OPEN' | 'CLOSED') {
    const supplierId = await this.getSupplierIdForUser(userId);

    const product = await this.prisma.product.findFirst({
      where: { id: productId, supplierId },
      include: { variants: true },
    });
    if (!product) throw new ForbiddenException('Product not found or access denied');

    // Set product active state and close pool if needed.
    const isActive = status === 'OPEN';
    await this.prisma.product.update({
      where: { id: productId },
      data: { isActive },
    });

    if (status === 'CLOSED' && product.variants.length > 0) {
      for (const variant of product.variants) {
        await this.dealService.closePoolsForVariant(variant.id);
      }
    }

    await this.cacheService.delPatterns(`product:${productId}`, 'products:*', 'home:feed:*');
    return { success: true };
  }

  async deleteProduct(userId: string, productId: string) {
    const supplierId = await this.getSupplierIdForUser(userId);

    await this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findFirst({
        where: { id: productId, supplierId },
      });
      if (!product) throw new ForbiddenException('Access denied');

      await tx.image.deleteMany({ where: { productId } });

      const variants = await tx.productVariant.findMany({
        where: { productId },
        select: { id: true },
      });
      const vIds = variants.map((v) => v.id);

      // Decouple relations
      await tx.pool.updateMany({
        where: { variantId: { in: vIds } },
        data: { variantId: null },
      });
      await tx.order.updateMany({
        where: { variantId: { in: vIds } },
        data: { variantId: null },
      });

      await tx.productStats.deleteMany({ where: { productId } });
      await tx.productVariant.deleteMany({ where: { productId } });
      await tx.product.delete({ where: { id: productId } });
    });

    await this.cacheService.delPatterns(`product:${productId}`, 'products:*', 'home:feed:*');
    return { success: true };
  }
}