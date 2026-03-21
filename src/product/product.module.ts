// src/product/product.module.ts
import { Module } from '@nestjs/common';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../common/cache/cache.service';
import { InteractionService } from '../interaction/interaction.service';

@Module({
  imports: [], // CacheModule is Global, so no need to import here if set to isGlobal: true
  controllers: [ProductController],
  providers: [
    ProductService,
    PrismaService,
    CacheService,
    InteractionService
  ],
  exports: [ProductService], // Export if other modules (like Search or Home) need it
})
export class ProductModule { }