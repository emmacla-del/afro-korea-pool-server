import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireUserId } from '../common/auth';
import { CatalogService } from './catalog.service';

const createProductSchema = z.object({
  product_name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  category: z.string().max(100).optional(),
});

const createVariantSchema = z.object({
  productId: z.string().uuid(),
  sku: z.string().min(1).max(80),
  unitPriceXaf: z.number().int().min(0).max(2_000_000_000),
  thresholdQty: z.number().int().min(1).max(100000),
  leadTimeDays: z.number().int().min(1).max(365).optional(),
});

const importSchema = z.object({
  products: z
    .array(
      z.object({
        product_name: z.string().min(1).max(200),
        description: z.string().max(2000).optional(),
        category: z.string().max(100).optional(),
        variants: z
          .array(
            z.object({
              sku: z.string().min(1).max(80),
              unitPriceXaf: z.number().int().min(0).max(2_000_000_000),
              thresholdQty: z.number().int().min(1).max(100000),
              leadTimeDays: z.number().int().min(1).max(365).optional(),
            }),
          )
          .min(1),
      }),
    )
    .min(1),
});

@Controller()
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  // Public browse (customer side)
  @Get('/products')
  async listPublicProducts() {
    return this.catalogService.listPublicProducts();
  }

  // Supplier side (requires x-user-id of a SUPPLIER user)
  @Get('/supplier/products')
  async listSupplierProducts(@Req() req: FastifyRequest) {
    const userId = requireUserId(req);
    return this.catalogService.listSupplierProducts(userId);
  }

  @Post('/supplier/products')
  async createProduct(@Req() req: FastifyRequest, @Body() body: unknown) {
    const userId = requireUserId(req);
    const parsed = createProductSchema.parse(body);
    return this.catalogService.createProduct(userId, parsed);
  }

  @Post('/supplier/variants')
  async createVariant(@Req() req: FastifyRequest, @Body() body: unknown) {
    const userId = requireUserId(req);
    const parsed = createVariantSchema.parse(body);
    return this.catalogService.createVariant(userId, parsed);
  }

  @Post('/supplier/catalog/import')
  async importCatalog(@Req() req: FastifyRequest, @Body() body: unknown) {
    const userId = requireUserId(req);
    const parsed = importSchema.parse(body);
    return this.catalogService.importCatalog(userId, parsed);
  }
}

