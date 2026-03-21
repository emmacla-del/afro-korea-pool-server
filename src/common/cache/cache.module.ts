import { Module, Global } from '@nestjs/common';
import { CacheService } from './cache.service';

@Global() // Makes it available everywhere without repeated imports
@Module({
    providers: [CacheService],
    exports: [CacheService],
})
export class CacheModule { }