// src/home/home.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ProductService } from '../product/product.service';
import { DealService } from '../deal/deal.service';
import { CacheService } from '../common/cache/cache.service';
import { PrismaService } from '../prisma/prisma.service';

// Cache TTLs (seconds)
const FEED_TTL = 60;          // Full home feed — 1 minute
const CATEGORIES_TTL = 300;   // Top categories — 5 minutes (changes rarely)

@Injectable()
export class HomeService {
    private readonly logger = new Logger(HomeService.name);

    constructor(
        private productService: ProductService,
        private dealService: DealService,
        private cacheService: CacheService, // 🔥 Injected
        private prisma: PrismaService,
    ) { }

    /**
     * Main home feed — cached per user (logged-in) or as a shared guest feed.
     *
     * Cache key strategy:
     *  - Guest:         "home:feed:guest"
     *  - Logged-in:     "home:feed:user:{userId}"     (personalised)
     *  - With neighbourhood: "home:feed:hood:{neighbourhoodId}"
     *
     * Invalidation: call invalidateFeed() after any product/pool write.
     */
    async getHomeFeed(userId?: string) {
        // Build a deterministic cache key
        let cacheKey = 'home:feed:guest';
        if (userId) {
            cacheKey = `home:feed:user:${userId}`;
        }

        // 🔥 Try cache first
        const cached = await this.cacheService.get<ReturnType<typeof this._buildFeed>>(cacheKey);
        if (cached) {
            this.logger.debug(`Cache HIT: ${cacheKey}`);
            return cached;
        }

        this.logger.debug(`Cache MISS: ${cacheKey}`);

        // 1. Pre-fetch user neighbourhood if logged in
        const user = userId
            ? await this.prisma.user.findUnique({
                where: { id: userId },
                select: { neighbourhoodId: true },
            })
            : null;

        // 2. Run ALL queries in parallel ⚡
        const [trending, teamDeals, nearYou, forYou, categories] = await Promise.all([
            this.productService.getTrendingProducts(10),
            this.dealService.getActiveTeamDeals(10),
            user?.neighbourhoodId
                ? this.productService.getProductsByNeighbourhood(user.neighbourhoodId, 10)
                : Promise.resolve({ data: [] }),
            userId
                ? this.productService.getPersonalizedProducts(userId, 10)
                : this.productService.getTrendingProducts(10),
            this.getTopCategories(),
        ]);

        // 3. Assemble feed
        const feed = this._buildFeed({ trending, teamDeals, nearYou, forYou, categories });

        // 🔥 Cache the result
        await this.cacheService.set(cacheKey, feed, FEED_TTL);

        return feed;
    }

    /**
     * Invalidate all home feed cache entries.
     * Call this after any write that could affect the feed
     * (new product, pool status change, etc.).
     */
    async invalidateFeed(): Promise<void> {
        await this.cacheService.delPattern('home:feed:*');
    }

    /**
     * Invalidate cache for a specific user (e.g. after they move neighbourhood).
     */
    async invalidateUserFeed(userId: string): Promise<void> {
        await this.cacheService.del(`home:feed:user:${userId}`);
    }

    // ── Private helpers ────────────────────────────────────────────────────────

    private _buildFeed({
        trending,
        teamDeals,
        nearYou,
        forYou,
        categories,
    }: {
        trending: { data: any[] };
        teamDeals: any[];
        nearYou: { data: any[] };
        forYou: { data: any[] };
        categories: any[];
    }) {
        return {
            categories,
            sections: [
                {
                    type: 'TRENDING',
                    title: '🔥 Trending Now',
                    products: trending.data,
                },
                {
                    type: 'TEAM_DEALS',
                    title: '👥 Active Team Deals',
                    products: teamDeals,
                },
                {
                    type: 'NEAR_YOU',
                    title: '📍 Available Near You',
                    products: nearYou.data,
                    isVisible: nearYou.data.length > 0, // Hide section if empty
                },
                {
                    type: 'FOR_YOU',
                    title: '✨ Just for You',
                    products: forYou.data,
                },
            ],
        };
    }

    /**
     * Top 8 categories by product count — cached separately since they
     * change far less often than the live feed.
     */
    async getTopCategories() {
        const cacheKey = 'home:categories';

        const cached = await this.cacheService.get<any[]>(cacheKey);
        if (cached) return cached;

        const categoriesCount = await this.prisma.product.groupBy({
            by: ['categoryId'],
            where: { categoryId: { not: null }, isActive: true },
            _count: { categoryId: true },
            orderBy: { _count: { categoryId: 'desc' } },
            take: 8,
        });

        const categoryIds = categoriesCount.map((c) => c.categoryId!);
        const categoryDetails = await this.prisma.category.findMany({
            where: { id: { in: categoryIds } },
        });

        const result = categoryDetails.map((c) => ({
            id: c.id,
            name: c.name,
            imageUrl: (c as any).imageUrl ?? null,
            count:
                categoriesCount.find((cat) => cat.categoryId === c.id)?._count.categoryId ?? 0,
        }));

        await this.cacheService.set(cacheKey, result, CATEGORIES_TTL);
        return result;
    }
}