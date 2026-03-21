// src/common/cache/cache.service.ts
import { Injectable, Inject, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

@Injectable()
export class CacheService {
    private readonly logger = new Logger(CacheService.name);

    constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) { }

    /**
     * Get a value from cache.
     * Returns undefined on miss or error — never throws.
     */
    async get<T>(key: string): Promise<T | undefined> {
        try {
            const data = await this.cacheManager.get<T>(key);
            if (data === undefined || data === null) return undefined;
            return data;
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.logger.warn(`Cache GET failed for key "${key}": ${message}`);
            return undefined;
        }
    }

    /**
     * Set a value in cache.
     * @param ttlSeconds - Time to live in seconds (converted to ms internally)
     */
    async set(key: string, value: any, ttlSeconds: number): Promise<void> {
        try {
            // cache-manager v5+ uses milliseconds
            await this.cacheManager.set(key, value, ttlSeconds * 1000);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.logger.warn(`Cache SET failed for key "${key}": ${message}`);
        }
    }

    /**
     * Delete a single key.
     */
    async del(key: string): Promise<void> {
        try {
            await this.cacheManager.del(key);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.logger.warn(`Cache DEL failed for key "${key}": ${message}`);
        }
    }

    /**
     * Delete all keys matching a glob-style pattern (e.g. "products:*").
     * Works with in-memory store. For Redis, use ioredis scan instead.
     */
    async delPattern(pattern: string): Promise<void> {
        try {
            const store: any = (this.cacheManager as any).store;

            if (typeof store?.keys !== 'function') {
                this.logger.warn(
                    `Cache store does not support key scanning — pattern "${pattern}" not cleared.`,
                );
                return;
            }

            const allKeys: string[] = await store.keys();

            // Convert glob pattern to regex: "products:*" → /^products:.*$/
            const regex = new RegExp(
                '^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$',
            );

            const keysToDelete = allKeys.filter((k) => regex.test(k));

            if (keysToDelete.length > 0) {
                await Promise.all(keysToDelete.map((k) => this.cacheManager.del(k)));
                this.logger.debug(
                    `Pattern "${pattern}" cleared ${keysToDelete.length} key(s): ${keysToDelete.join(', ')}`,
                );
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.logger.warn(`Cache DEL PATTERN failed for "${pattern}": ${message}`);
        }
    }

    /**
     * Invalidate multiple patterns at once — convenience helper used after
     * write operations that affect several cache namespaces.
     */
    async delPatterns(...patterns: string[]): Promise<void> {
        await Promise.all(patterns.map((p) => this.delPattern(p)));
    }

    /**
     * Completely wipe the cache. Use for admin resets only.
     */
    async reset(): Promise<void> {
        try {
            if (typeof (this.cacheManager as any).reset === 'function') {
                await (this.cacheManager as any).reset();
                this.logger.log('Cache fully reset.');
            } else {
                this.logger.warn('Cache reset not supported by configured cache driver.');
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.logger.warn(`Cache RESET failed: ${message}`);
        }
    }
}