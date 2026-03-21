import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProductService } from '../product/product.service';
import { DealService } from '../deal/deal.service';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { CacheModule } from '../common/cache/cache.module'; // 👈 Import your new module

@Module({
  imports: [
    CloudinaryModule,
    CacheModule, // 👈 This brings in BOTH CacheService AND CACHE_MANAGER
  ],
  controllers: [CatalogController],
  providers: [
    CatalogService,
    PrismaService,
    ProductService,
    DealService
    // ❌ REMOVE CacheService from here; it's now coming from CacheModule
  ],
  exports: [CatalogService]
})
export class CatalogModule { }