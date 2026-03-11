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

// Schema for multipart fields (all strings from form-data)
const createProductMultipartSchema = z.object({
  product_name: z.string().min(1, 'Product name is required'),
  description: z.string().optional(),
  sku: z.string().min(1, 'SKU is required'),
  price: z
    .string()
    .transform((v) => parseFloat(v))
    .refine((v) => !isNaN(v) && v >= 0, { message: 'Price must be a valid number >= 0' }),
  stock: z
    .string()
    .transform((v) => parseInt(v, 10))
    .refine((v) => Number.isInteger(v) && v >= 1, { message: 'Stock must be a positive integer' }),
  currency: z.string().max(10).default('XAF').optional(),
});

// Existing schemas (unchanged)
const createVariantSchema = z.object({
  productId: z.string().uuid(),
  sku: z.string().min(1).max(80),
  unitPriceXaf: z.number().int().min(0).max(2_000_000_000),
  thresholdQty: z.number().int().min(1).max(100000),
  leadTimeDays: z.number().int().min(1).max(365).optional(),
});

const importSchema = z.object({
  products: z.array(
    z.object({
      product_name: z.string().min(1).max(200),
      description: z.string().max(2000).optional(),
      category: z.string().max(100).optional(),
      variants: z.array(
        z.object({
          sku: z.string().min(1).max(80),
          unitPriceXaf: z.number().int().min(0).max(2_000_000_000),
          thresholdQty: z.number().int().min(1).max(100000),
          leadTimeDays: z.number().int().min(1).max(365).optional(),
        }),
      ).min(1),
    }),
  ).min(1),
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

  // Supplier side (requires authentication)
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

  // ==================== NEW: Multipart product creation with images ====================
  @Post('/supplier/products')
  @UseGuards(JwtAuthGuard)
  async createProduct(@Req() req: FastifyRequest) {
    const userId = requireUserId(req);
    const parts = (req as any).parts(); // type assertion – works at runtime
    const fields: Record<string, any> = {};
    const files: Array<{ buffer: Buffer; filename: string; mimetype: string }> = [];

    for await (const part of parts) {
      if (part.type === 'file') {
        const buffer = await part.toBuffer();
        files.push({
          buffer,
          filename: part.filename,
          mimetype: part.mimetype,
        });
      } else {
        fields[part.fieldname] = part.value;
      }
    }

    console.log(
      `${new Date().toISOString()} - [catalog] POST /supplier/products fields:`,
      fields,
    );

    const parseResult = createProductMultipartSchema.safeParse(fields);
    if (!parseResult.success) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: parseResult.error.issues,
      });
    }

    const { product_name, description, sku, price, stock, currency } = parseResult.data;

    const created = await this.catalogService.createProductWithImages(
      userId,
      {
        product_name,
        description,
        sku,
        price,
        stock,
        currency: currency || 'XAF',
      },
      files,
    );

    return { id: created.id };
  }
  // ======================================================================================

  // Other endpoints remain unchanged
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
    return this.catalogService.updateSupplierProductPoolStatus(userId, id, parsed.poolStatus);
  }

  @Post('/supplier/catalog/import')
  @UseGuards(JwtAuthGuard)
  async importCatalog(@Req() req: FastifyRequest, @Body() body: unknown) {
    const userId = requireUserId(req);
    const parsed = importSchema.parse(body);
    return this.catalogService.importCatalog(userId, parsed);
  }
}