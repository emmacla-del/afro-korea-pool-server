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
   * GET PRODUCTS — Marketplace list with filtering, sorting, search, and cache.
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
    } = params;

    // Build WHERE clause
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

    // Build ORDER BY
    let orderBy: Prisma.ProductOrderByWithRelationInput = {};
    switch (sortBy) {
      case 'price':
        orderBy = { minPrice: order };
        break;
      case 'popularity':
        orderBy = { stats: { score: order } };
        break;
      case 'trending':
        orderBy = { stats: { score: 'desc' } };
        break;
      default:
        orderBy[sortBy] = order;
    }

    // Cache key
    const cacheKey = `products:${JSON.stringify({ skip, take, categoryId, supplierId, sortBy, order, search, userId, neighbourhoodId })}`;
    if (useCache) {
      const cached = await this.cacheService.get<any>(cacheKey);
      if (cached) return cached;
    }

    // Query
    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip,
        take,
        orderBy,
        include: {
          images: { orderBy: { order: 'asc' }, take: 1 },
          variants: { where: { isActive: true }, take: 1, orderBy: { unitPriceXaf: 'asc' } },
          supplier: { select: { id: true, displayName: true, verificationStatus: true } },
          category_: true,
          stats: true,
          pools: {
            where: { status: 'OPEN' },
            take: 1,
            select: { id: true, currentBuyers: true, minBuyers: true, deadlineAt: true, teamPrice: true },
          },
        },
      }),
      this.prisma.product.count({ where }),
    ]);

    const result = {
      data: products.map((product) => {
        const firstVariant = product.variants[0];
        const activePool = product.pools[0];
        const hasActiveDeal = !!activePool;
        return {
          ...product,
          // Ensure price from variant is available at root
          price: firstVariant?.unitPriceXaf ?? product.minPrice ?? 0,
          teamPrice: activePool?.teamPrice ?? null,
          minBuyers: activePool?.minBuyers ?? null,
          currentBuyers: activePool?.currentBuyers ?? 0,
          dealEndTime: activePool?.deadlineAt ?? null,
          hasActiveDeal,
          dealProgress: hasActiveDeal && activePool?.minBuyers
            ? (activePool.currentBuyers ?? 0) / activePool.minBuyers
            : 0,
        };
      }),
      total,
      skip,
      take,
    };

    await this.cacheService.set(cacheKey, result, 300); // 5 min
    return result;
  }

  /**
   * GET PRODUCT BY ID — with view interaction tracking.
   */
  async getProductById(id: string, userId?: string) {
    const product = await this.prisma.product.findUnique({
      where: { id, isActive: true },
      include: {
        images: { orderBy: { order: 'asc' } },
        variants: { where: { isActive: true }, orderBy: { unitPriceXaf: 'asc' } },
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
          where: { status: 'OPEN' },
          take: 1,
          select: { id: true, currentBuyers: true, minBuyers: true, deadlineAt: true, teamPrice: true },
        },
        _count: { select: { pools: { where: { status: 'OPEN' } } } },
      },
    });

    if (!product) throw new NotFoundException(`Product with ID ${id} not found`);

    // Enhance product with team deal fields at root
    const activePool = product.pools[0];
    const firstVariant = product.variants[0];
    const enhancedProduct = {
      ...product,
      price: firstVariant?.unitPriceXaf ?? product.minPrice ?? 0,
      teamPrice: activePool?.teamPrice ?? null,
      minBuyers: activePool?.minBuyers ?? null,
      currentBuyers: activePool?.currentBuyers ?? 0,
      dealEndTime: activePool?.deadlineAt ?? null,
      hasActiveDeal: !!activePool,
      dealProgress: activePool && activePool.minBuyers
        ? (activePool.currentBuyers ?? 0) / activePool.minBuyers
        : 0,
    };

    // Track view asynchronously
    if (userId) {
      this.interactionService
        .trackInteraction(userId, id, InteractionType.VIEW)
        .catch((err) => {
          const errMessage = err instanceof Error ? err.message : String(err);
          this.logger.error(`Failed to track view: ${errMessage}`);
        });
    }

    return enhancedProduct;
  }

  /**
   * PERSONALIZED RECOMMENDATIONS — Collaborative filtering.
   */
  async getPersonalizedProducts(userId: string, take = 10) {
    const userInteractions = await this.prisma.userProductInteraction.findMany({
      where: { userId },
      select: { productId: true },
      distinct: ['productId'],
    });

    const interactedProductIds = userInteractions.map((i) => i.productId);

    if (interactedProductIds.length === 0) {
      return this.getProducts({ take, sortBy: 'trending' });
    }

    const similarUsers = await this.prisma.userProductInteraction.findMany({
      where: {
        productId: { in: interactedProductIds },
        userId: { not: userId },
      },
      distinct: ['userId'],
      take: 50,
    });

    const similarUserIds = similarUsers.map((u) => u.userId);

    if (similarUserIds.length === 0) {
      return this.getProducts({ take, sortBy: 'trending' });
    }

    const recommendations = await this.prisma.userProductInteraction.groupBy({
      by: ['productId'],
      where: {
        userId: { in: similarUserIds },
        productId: { notIn: interactedProductIds },
      },
      _count: { productId: true },
      orderBy: { _count: { productId: 'desc' } },
      take,
    });

    const productIds = recommendations.map((r) => r.productId);

    if (productIds.length === 0) {
      return this.getProducts({ take, sortBy: 'trending' });
    }

    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, isActive: true },
      include: {
        images: { take: 1 },
        variants: { take: 1 },
        supplier: true,
        stats: true,
        pools: {
          where: { status: 'OPEN' },
          take: 1,
          select: { id: true, currentBuyers: true, minBuyers: true, deadlineAt: true, teamPrice: true },
        },
      },
    });

    const sortedProducts = productIds
      .map((productId) => products.find((product) => product.id === productId))
      .filter((product): product is NonNullable<typeof product> => product !== undefined);

    const result = {
      data: sortedProducts.map((product) => {
        const firstVariant = product.variants[0];
        const activePool = product.pools[0];
        const hasActiveDeal = !!activePool;
        return {
          ...product,
          price: firstVariant?.unitPriceXaf ?? product.minPrice ?? 0,
          teamPrice: activePool?.teamPrice ?? null,
          minBuyers: activePool?.minBuyers ?? null,
          currentBuyers: activePool?.currentBuyers ?? 0,
          dealEndTime: activePool?.deadlineAt ?? null,
          hasActiveDeal,
          dealProgress: hasActiveDeal && activePool?.minBuyers
            ? (activePool.currentBuyers ?? 0) / activePool.minBuyers
            : 0,
        };
      }),
      total: sortedProducts.length,
      skip: 0,
      take,
    };

    return result;
  }

  /**
   * GET PRODUCTS BY NEIGHBOURHOOD — "Near You" section.
   */
  async getProductsByNeighbourhood(neighbourhoodId: string, take = 10) {
    return this.getProducts({ neighbourhoodId, take, sortBy: 'popularity' });
  }

  /**
   * GET TRENDING PRODUCTS.
   */
  async getTrendingProducts(take = 10) {
    return this.getProducts({ take, sortBy: 'trending' });
  }

  /**
   * UPDATE MIN PRICE — call after any variant price change.
   * Invalidates all affected caches including the home feed.
   */
  async updateMinPrice(productId: string) {
    const minVariant = await this.prisma.productVariant.findFirst({
      where: { productId, isActive: true },
      orderBy: { unitPriceXaf: 'asc' },
      select: { unitPriceXaf: true },
    });

    await this.prisma.product.update({
      where: { id: productId },
      data: { minPrice: minVariant?.unitPriceXaf ?? null },
    });

    // Invalidate caches
    await this.cacheService.delPatterns(
      'products:*',
      `product:${productId}`,
      'home:feed:*',
    );
  }
}