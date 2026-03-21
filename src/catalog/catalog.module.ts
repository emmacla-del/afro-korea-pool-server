import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProductService } from '../product/product.service';
import { DealService } from '../deal/deal.service';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { CacheModule } from '../common/cache/cache.module';
import { InteractionModule } from '../interaction/interaction.module'; // 👈 ADD THIS

@Module({
  imports: [
    CloudinaryModule,
    CacheModule,
    InteractionModule, // 👈 ADD THIS (Fixes InteractionService at index [2] error)
  ],
  controllers: [CatalogController],
  providers: [
    CatalogService,
    PrismaService,
    ProductService,
    DealService
  ],
  exports: [CatalogService]
})
export class CatalogModule { }