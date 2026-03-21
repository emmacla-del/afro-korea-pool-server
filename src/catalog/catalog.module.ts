import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProductService } from '../product/product.service';
import { DealService } from '../deal/deal.service';
import { CacheService } from '../common/cache/cache.service'; // 👈 Matches your Service import

@Module({
  imports: [],
  controllers: [CatalogController],
  providers: [
    CatalogService,
    PrismaService,
    CacheService,    // 👈 Added
    ProductService,
    DealService
  ],
  exports: [CatalogService]
})
export class CatalogModule { }