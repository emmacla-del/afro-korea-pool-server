// src/product/product.service.ts
import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, InteractionType } from '@prisma/client';
import { CacheService } from '../common/cache/cache.service';
import { InteractionService } from '../interaction/interaction.service';

@Injectable()
export class ProductService {
  private readonly logger = new Logger(ProductService.name);

  constructor(
    private prisma: PrismaService,
    private cacheService: CacheService,
    private interactionService: InteractionService,
  ) { }

  /**
   * GET PRODUCTS — Marketplace list with true Team Deal filtering and cache.
   */
  async getProducts(params: {
    skip?: number;
    take?: number;
    categoryId?: string;
    supplierId?: string;
    sortBy?: 'createdAt' | 'price' | 'popularity' | 'trending';
    order?: 'asc' | 'desc';
    search?: string;
    userId?: string;
    neighbourhoodId?: string;
    useCache?: boolean;
    hasTeamDeal?: boolean;
  }) {
    const {
      skip = 0,
      take = 20,
      categoryId,
      supplierId,
      sortBy = 'createdAt',
      order = 'desc',
      search,
      userId,
      neighbourhoodId,
      useCache = true,
      hasTeamDeal = false,
    } = params;

    // 1. Build WHERE clause
    const where: Prisma.ProductWhereInput = { isActive: true };
    if (categoryId) where.categoryId = categoryId;
    if (supplierId) where.supplierId = supplierId;
    if (neighbourhoodId) where.supplier = { neighbourhoodId };

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Only include products with an OPEN pool AND a valid team price
    if (hasTeamDeal) {
      where.pools = {
        some: {
          status: 'OPEN',
          teamPrice: { not: null },
        },
      };
    }

    // 2. Build ORDER BY
    let orderBy: Prisma.ProductOrderByWithRelationInput = {};
    switch (sortBy) {
      case 'price':
        orderBy = { minPrice: order };
        break;
      case 'popularity':
      case 'trending':
        orderBy = { stats: { score: 'desc' } };
        break;
      default:
        orderBy[sortBy] = order;
    }

    // 3. Cache Management
    const cacheKey = `products:${JSON.stringify({ ...params, hasTeamDeal })}`;
    if (useCache) {
      const cached = await this.cacheService.get<any>(cacheKey);
      if (cached) return cached;
    }

    // 4. Database Query
    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip,
        take,
        orderBy,
        include: {
          images: { orderBy: { order: 'asc' }, take: 1 },
          variants: {
            where: { isActive: true },
            take: 1,
            orderBy: { unitPriceXaf: 'asc' },
          },
          supplier: {
            select: {
              id: true,
              displayName: true,
              verificationStatus: true,
            },
          },
          category_: true,
          stats: true,
          pools: {
            where: { status: 'OPEN', teamPrice: { not: null } },
            take: 1,
            select: {
              id: true,
              currentBuyers: true,
              minBuyers: true,
              deadlineAt: true,
              teamPrice: true,
            },
          },
        },
      }),
      this.prisma.product.count({ where }),
    ]);

    const result = {
      data: products.map((product) => this.transformProduct(product)),
      total,
      skip,
      take,
    };

    if (useCache) await this.cacheService.set(cacheKey, result, 300); // 5 min
    return result;
  }

  /**
   * Standardized Data Transformation for Flutter
   */
  private transformProduct(product: any) {
    const firstVariant = product.variants?.[0];
    const activePool = product.pools?.[0];
    const hasActiveDeal = !!activePool;

    return {
      ...product,
      // Map properties for UI-ready visibility
      price: firstVariant?.unitPriceXaf ?? product.minPrice ?? 0,
      teamPrice: activePool?.teamPrice ?? null,
      description: product.description ?? '',
      minBuyers: activePool?.minBuyers ?? null,
      currentBuyers: activePool?.currentBuyers ?? 0,
      dealEndTime: activePool?.deadlineAt ?? null,
      hasActiveDeal,
      dealProgress:
        hasActiveDeal && activePool?.minBuyers
          ? (activePool.currentBuyers ?? 0) / activePool.minBuyers
          : 0,
    };
  }

  /**
   * GET PRODUCT BY ID with interaction tracking
   */
  async getProductById(id: string, userId?: string) {
    const product = await this.prisma.product.findUnique({
      where: { id, isActive: true },
      include: {
        images: { orderBy: { order: 'asc' } },
        variants: {
          where: { isActive: true },
          orderBy: { unitPriceXaf: 'asc' },
        },
        category_: true,
        supplier: {
          select: {
            id: true,
            displayName: true,
            description: true,
            country: true,
            verificationStatus: true,
            _count: { select: { products: true } },
          },
        },
        stats: true,
        pools: {
          where: { status: 'OPEN', teamPrice: { not: null } },
          take: 1,
          select: {
            id: true,
            currentBuyers: true,
            minBuyers: true,
            deadlineAt: true,
            teamPrice: true,
          },
        },
      },
    });

    if (!product) throw new NotFoundException('Product not found');

    if (userId) {
      this.interactionService
        .trackInteraction(userId, id, InteractionType.VIEW)
        .catch(() => { });
    }

    return this.transformProduct(product);
  }

  /**
   * PERSONALIZED RECOMMENDATIONS — Collaborative filtering.
   */
  async getPersonalizedProducts(userId: string, take = 10) {
    // 1. Get user's recent interactions
    const interactions = await this.prisma.userProductInteraction.findMany({
      where: { userId },
      select: { productId: true },
      distinct: ['productId'],
      take: 20,
    });

    const interactedIds = interactions.map((i) => i.productId);
    if (interactedIds.length === 0) {
      return this.getProducts({ take, sortBy: 'trending' });
    }

    // 2. Find "people also viewed" products
    const recommendations = await this.prisma.userProductInteraction.groupBy({
      by: ['productId'],
      where: {
        productId: { notIn: interactedIds },
        userId: { not: userId },
        product: { isActive: true },
      },
      _count: { productId: true },
      orderBy: { _count: { productId: 'desc' } },
      take,
    });

    const productIds = recommendations.map((r) => r.productId);
    if (productIds.length === 0) {
      return this.getProducts({ take, sortBy: 'trending' });
    }

    // 3. Hydrate product data
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      include: {
        images: { take: 1 },
        variants: { take: 1 },
        category_: true,
        supplier: true,
        pools: {
          where: { status: 'OPEN', teamPrice: { not: null } },
          take: 1,
        },
      },
    });

    return {
      data: products.map((p) => this.transformProduct(p)),
      total: products.length,
      skip: 0,
      take,
    };
  }

  /**
   * Products by neighbourhood (for "Near You" section)
   */
  async getProductsByNeighbourhood(neighbourhoodId: string, take = 15) {
    return this.getProducts({ neighbourhoodId, take, sortBy: 'popularity' });
  }

  /**
   * Trending products (uses the same getProducts with trending sort)
   */
  async getTrendingProducts(take = 10) {
    return this.getProducts({ take, sortBy: 'trending' });
  }

  /**
   * Update the minPrice field on a product (called after variant updates)
   */
  async updateMinPrice(productId: string) {
    const minVariant = await this.prisma.productVariant.findFirst({
      where: { productId, isActive: true },
      orderBy: { unitPriceXaf: 'asc' },
    });

    await this.prisma.product.update({
      where: { id: productId },
      data: { minPrice: minVariant?.unitPriceXaf ?? null },
    });

    // Clear relevant caches
    await this.cacheService.delPatterns('products:*', `product:${productId}`);
  }
}