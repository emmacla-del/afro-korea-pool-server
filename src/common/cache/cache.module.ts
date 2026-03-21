import { Module, Global } from '@nestjs/common';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { CacheService } from './cache.service';

@Global()
@Module({
    imports: [
        NestCacheModule.register({
            ttl: 600,
            max: 100,
        }),
    ],
    providers: [CacheService],
    exports: [CacheService, NestCacheModule], // 👈 CRITICAL: Export NestCacheModule too
})
export class CacheModule { }