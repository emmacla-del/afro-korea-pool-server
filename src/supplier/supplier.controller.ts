import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Param,
    Body,
    Query,
    Req,
    UseGuards,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { NotBlockedGuard } from '../auth/not-blocked.guard';
import { requireUserId } from '../common/auth';
import { SupplierService } from './supplier.service';
import { z } from 'zod';

// ── Validation schemas ─────────────────────────────────────────────────────

const createProductSchema = z.object({
    title: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    categoryId: z.string().uuid().optional(),
    unitPriceXaf: z.number().int().min(1),
    thresholdQty: z.number().int().min(1),
    leadTimeDays: z.number().int().min(1).max(365).optional(),
});

const updateProductSchema = z.object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
    categoryId: z.string().uuid().optional(),
    isActive: z.boolean().optional(),
    unitPriceXaf: z.number().int().min(1).optional(),
    thresholdQty: z.number().int().min(1).optional(),
});

// ══════════════════════════════════════════════════════════════════════════════

@Controller('supplier')
@UseGuards(NotBlockedGuard)
export class SupplierController {
    constructor(private readonly supplierService: SupplierService) { }

    // ── Verification ───────────────────────────────────────────────────────────

    /**
     * POST /supplier/request-verification
     */
    @Post('request-verification')
    async requestVerification(@Req() req: FastifyRequest) {
        const userId = requireUserId(req);
        return this.supplierService.requestVerification(userId);
    }

    // ── Products ───────────────────────────────────────────────────────────────

    /**
     * GET /supplier/products
     * Returns all products belonging to the authenticated supplier.
     */
    @Get('products')
    async getProducts(@Req() req: FastifyRequest) {
        const userId = requireUserId(req);
        return this.supplierService.getProducts(userId);
    }

    /**
     * GET /supplier/products/summary
     * Returns total/active/inactive product counts.
     */
    @Get('products/summary')
    async getProductSummary(@Req() req: FastifyRequest) {
        const userId = requireUserId(req);
        return this.supplierService.getProductSummary(userId);
    }

    /**
     * POST /supplier/products
     * Creates a new product with an initial variant.
     */
    @Post('products')
    async createProduct(@Req() req: FastifyRequest, @Body() body: unknown) {
        const userId = requireUserId(req);
        const data = createProductSchema.parse(body);
        return this.supplierService.createProduct(userId, data);
    }

    /**
     * PATCH /supplier/products/:id
     * Updates product fields and/or the latest variant price/stock.
     */
    @Patch('products/:id')
    async updateProduct(
        @Req() req: FastifyRequest,
        @Param('id') productId: string,
        @Body() body: unknown,
    ) {
        const userId = requireUserId(req);
        const data = updateProductSchema.parse(body);
        return this.supplierService.updateProduct(userId, productId, data);
    }

    /**
     * DELETE /supplier/products/:id
     * Soft-deletes (deactivates) a product.
     */
    @Delete('products/:id')
    async deleteProduct(
        @Req() req: FastifyRequest,
        @Param('id') productId: string,
    ) {
        const userId = requireUserId(req);
        return this.supplierService.deleteProduct(userId, productId);
    }

    // ── Orders ─────────────────────────────────────────────────────────────────

    /**
     * GET /supplier/orders
     * Returns all customer orders for this supplier.
     * Optional: ?status=PAID
     */
    @Get('orders')
    async getOrders(
        @Req() req: FastifyRequest,
        @Query('status') status?: string,
    ) {
        const userId = requireUserId(req);
        return this.supplierService.getOrders(userId, status);
    }

    // ── Catalog imports ────────────────────────────────────────────────────────

    /**
     * GET /supplier/catalog-imports/latest
     * Returns the latest catalog import status (stub until bulk import is built).
     */
    @Get('catalog-imports/latest')
    async getLatestCatalogImport(@Req() req: FastifyRequest) {
        const userId = requireUserId(req);
        return this.supplierService.getLatestCatalogImport(userId);
    }
}