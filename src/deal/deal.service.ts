// src/deal/deal.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../common/cache/cache.service';
import { PoolStatus, Pool, ProductVariant } from '@prisma/client';
import { randomUUID } from 'crypto';

// Cache TTLs (seconds)
const TEAM_DEALS_TTL = 30;    // Active team deals — 30s (high churn)
const ACTIVE_POOL_TTL = 15;   // Single active pool — 15s (buyer count changes fast)

@Injectable()
export class DealService {
    private readonly logger = new Logger(DealService.name);

    constructor(
        private prisma: PrismaService,
        private cacheService: CacheService, // 🔥 Injected
    ) { }

    // ── Read Operations ────────────────────────────────────────────────────────

    /**
     * Fetch pools for given variant IDs, ensuring latest per variant.
     */
    async getPoolsForVariants(variantIds: string[]): Promise<Pool[]> {
        if (!variantIds.length) return [];

        return this.prisma.pool.findMany({
            where: {
                variantId: { in: variantIds },
                status: {
                    in: [
                        PoolStatus.OPEN,
                        PoolStatus.PAYMENT_WINDOW,
                        PoolStatus.EXPIRED,
                        PoolStatus.FAILED_PAYMENT,
                        PoolStatus.PURCHASED,
                    ],
                },
            },
            distinct: ['variantId'],      // PostgreSQL: DISTINCT ON variantId
            orderBy: [
                { variantId: 'asc' },       // Must match DISTINCT column
                { createdAt: 'desc' },      // Latest pool per variant
            ],
        });
    }

    /**
     * Transform a Pool into an API-ready object with urgency scoring.
     */
    transformPool(pool: Pool & { variant?: (ProductVariant & { product?: any }) | null }) {
        const hoursLeft = pool.deadlineAt
            ? (pool.deadlineAt.getTime() - Date.now()) / (1000 * 60 * 60)
            : 0;

        const product = pool.variant?.product;

        return {
            id: pool.id,
            variantId: pool.variantId,
            dealType: pool.dealType,
            teamPrice: pool.teamPrice,
            minBuyers: pool.minBuyers,
            currentBuyers: pool.currentBuyers,
            status: pool.status,
            committedQty: pool.committedQty,
            thresholdQtySnapshot: pool.thresholdQtySnapshot,
            unitPriceSnapshot: pool.unitPriceXafSnapshot,
            deadlineAt: pool.deadlineAt,
            paymentWindowEndsAt: pool.paymentWindowEndsAt,
            isExpiringSoon: hoursLeft > 0 && hoursLeft < 24,
            urgencyLabel: hoursLeft < 6 ? 'Closing soon!' : null,
            product: product
                ? {
                    id: product.id,
                    title: product.title,
                    images: product.images,
                    supplier: product.supplier,
                }
                : null,
        };
    }

    /**
     * Attach pools to a list of variants (mutates variants array).
     */
    attachPoolsToVariants(
        variants: ProductVariant[],
        pools: (Pool & { variant?: ProductVariant })[],
    ) {
        const map = new Map<string, any>();
        for (const pool of pools) {
            if (pool.variantId) map.set(pool.variantId, this.transformPool(pool));
        }

        for (const variant of variants) {
            (variant as any).pools = map.has(variant.id) ? [map.get(variant.id)] : [];
        }
    }

    /**
     * Get active team deals (OPEN pools) with product info.
     * Used by Home Feed's "Team Deals" section — cached at 30s.
     */
    async getActiveTeamDeals(take = 10) {
        const cacheKey = `deals:active:${take}`;

        // 🔥 Try cache first
        const cached = await this.cacheService.get<any[]>(cacheKey);
        if (cached) {
            this.logger.debug(`Cache HIT: ${cacheKey}`);
            return cached;
        }

        const pools = await this.prisma.pool.findMany({
            where: { status: PoolStatus.OPEN },
            include: {
                variant: {
                    include: {
                        product: {
                            include: {
                                supplier: true,
                                images: { take: 1, orderBy: { order: 'asc' } },
                            },
                        },
                    },
                },
            },
            orderBy: [{ createdAt: 'desc' }],
            take,
        });

        const result = pools.map((pool) => this.transformPool(pool));

        // 🔥 Cache result
        await this.cacheService.set(cacheKey, result, TEAM_DEALS_TTL);

        return result;
    }

    /**
     * Get the currently active pool for a variant (OPEN or PAYMENT_WINDOW).
     * Cached briefly since buyer count increments frequently.
     */
    async getActivePoolForVariant(variantId: string) {
        const cacheKey = `pool:active:${variantId}`;

        const cached = await this.cacheService.get<any>(cacheKey);
        if (cached) return cached;

        const pool = await this.prisma.pool.findFirst({
            where: {
                variantId,
                status: { in: [PoolStatus.OPEN, PoolStatus.PAYMENT_WINDOW] },
            },
            orderBy: [{ createdAt: 'desc' }],
        });

        if (pool) {
            await this.cacheService.set(cacheKey, pool, ACTIVE_POOL_TTL);
        }

        return pool;
    }

    // ── Write Operations ────────────────────────────────────────────────────────

    /**
     * Create a new pool for a variant.
     * Invalidates team deals cache and the variant's active pool cache.
     */
    async createPool(variantId: string, deadlineHours = 72): Promise<Pool> {
        const variant = await this.prisma.productVariant.findUnique({
            where: { id: variantId },
        });
        if (!variant) throw new Error('Variant not found');

        const now = new Date();
        const deadlineAt = new Date(now.getTime() + deadlineHours * 60 * 60 * 1000);

        const pool = await this.prisma.pool.create({
            data: {
                id: randomUUID(),
                variantId,
                status: PoolStatus.OPEN,
                thresholdQtySnapshot: variant.thresholdQty,
                unitPriceXafSnapshot: variant.unitPriceXaf,
                deadlineAt,
            },
        });

        // 🔥 Invalidate caches
        await this.cacheService.delPatterns(
            'deals:active:*',
            `pool:active:${variantId}`,
            'home:feed:*',          // Feed sections include team deals
        );

        return pool;
    }

    /**
     * Close all open pools for a variant (e.g. when product is deactivated).
     * Invalidates related caches.
     */
    async closePoolsForVariant(variantId: string): Promise<void> {
        await this.prisma.pool.updateMany({
            where: {
                variantId,
                status: { in: [PoolStatus.OPEN, PoolStatus.PAYMENT_WINDOW] },
            },
            data: { status: PoolStatus.EXPIRED },
        });

        // 🔥 Invalidate caches
        await this.cacheService.delPatterns(
            'deals:active:*',
            `pool:active:${variantId}`,
            'home:feed:*',
        );
    }
}