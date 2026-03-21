import { Module, Global } from '@nestjs/common';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { CacheService } from './cache.service';

@Global()
@Module({
    imports: [
        // This provides the "CACHE_MANAGER" storage engine to your CacheService
        NestCacheModule.register({
            ttl: 600, // 10 minutes (seconds in newer versions, ms in older)
            max: 100, // Maximum items in memory
        }),
    ],
    providers: [CacheService],
    exports: [CacheService, NestCacheModule], // Exporting both ensures they are visible to CatalogModule
})
export class CacheModule { }