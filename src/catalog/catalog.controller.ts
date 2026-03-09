import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { requireUserId } from '../common/auth';
import { CatalogService } from './catalog.service';

const createProductSchema = z.object({
  product_name: z.string().min(1).max(200).optional(),
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  category: z.string().max(100).optional(),
  currency: z.string().max(10).optional(),
})
  .superRefine((data, ctx) => {
    if (!data.product_name && !data.name) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['product_name'],
        message: 'product_name is required',
      });
    }
  })
  .transform((data) => ({
    product_name: data.product_name ?? data.name ?? '',
    description: data.description,
    category: data.category,
  }));

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

const patchProductSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  price: z.number().min(0).optional(),
  stock: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

const patchProductStatusSchema = z.object({
  poolStatus: z.enum(['OPEN', 'CLOSED']),
});

@Controller()
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) { }

  // Public browse (customer side)
  @Get('/products')
  async listPublicProducts() {
    return this.catalogService.listPublicProducts();
  }

  // Supplier side (requires x-user-id of a SUPPLIER user)
  @Get('/supplier/products')
  @UseGuards(JwtAuthGuard)
  async listSupplierProducts(@Req() req: FastifyRequest) {
    const userId = requireUserId(req);
    return this.catalogService.listSupplierProducts(userId);
  }

  @Get('/supplier/products/summary')
  @UseGuards(JwtAuthGuard)
  async supplierProductsSummary(@Req() req: FastifyRequest) {
    const userId = requireUserId(req);
    return this.catalogService.getSupplierProductsSummary(userId);
  }

  @Get('/supplier/catalog-imports/latest')
  @UseGuards(JwtAuthGuard)
  async latestCatalogImport(@Req() req: FastifyRequest) {
    const userId = requireUserId(req);
    return this.catalogService.getLatestCatalogImport(userId);
  }

  @Post('/supplier/products')
  @UseGuards(JwtAuthGuard)
  async createProduct(@Req() req: FastifyRequest, @Body() body: unknown) {
    const userId = requireUserId(req);
    console.log(
      `${new Date().toISOString()} - [catalog] POST /supplier/products body:`,
      body,
    );

    const parsed = createProductSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
          code: issue.code,
        })),
      });
    }

    const created = await this.catalogService.createProduct(userId, parsed.data);
    return { id: created.id };
  }

  @Post('/supplier/variants')
  @UseGuards(JwtAuthGuard)
  async createVariant(@Req() req: FastifyRequest, @Body() body: unknown) {
    const userId = requireUserId(req);
    const parsed = createVariantSchema.parse(body);
    return this.catalogService.createVariant(userId, parsed);
  }

  @Patch('/supplier/products/:id')
  @UseGuards(JwtAuthGuard)
  async patchProduct(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const userId = requireUserId(req);
    const parsed = patchProductSchema.parse(body);
    return this.catalogService.updateSupplierProduct(userId, id, parsed);
  }

  @Patch('/supplier/products/:id/status')
  @UseGuards(JwtAuthGuard)
  async patchProductStatus(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const userId = requireUserId(req);
    const parsed = patchProductStatusSchema.parse(body);
    return this.catalogService.updateSupplierProductPoolStatus(
      userId,
      id,
      parsed.poolStatus,
    );
  }

  @Post('/supplier/catalog/import')
  @UseGuards(JwtAuthGuard)
  async importCatalog(@Req() req: FastifyRequest, @Body() body: unknown) {
    const userId = requireUserId(req);
    const parsed = importSchema.parse(body);
    return this.catalogService.importCatalog(userId, parsed);
  }
}
