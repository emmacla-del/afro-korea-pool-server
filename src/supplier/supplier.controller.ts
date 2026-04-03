// src/supplier/supplier.controller.ts
import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Query,
    Req,
    Param,
    UseGuards,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { NotBlockedGuard } from '../auth/not-blocked.guard';
import { requireUserId } from '../common/auth';
import { SupplierService } from './supplier.service';
import { CreateProductDto } from './dto/create-product.dto';
import { CatalogService } from '../catalog/catalog.service'; // 👈 added

@Controller('supplier')
@UseGuards(NotBlockedGuard)
export class SupplierController {
    constructor(
        private readonly supplierService: SupplierService,
        private readonly catalogService: CatalogService, // 👈 added
    ) { }

    // ── Profile & Summary ──────────────────────────────────────────────────────

    @Get('summary')
    async getProductSummary(@Req() req: FastifyRequest) {
        const userId = requireUserId(req);
        return this.supplierService.getProductSummary(userId);
    }

    // ── Verification ───────────────────────────────────────────────────────────

    @Post('request-verification')
    async requestVerification(@Req() req: FastifyRequest) {
        const userId = requireUserId(req);
        return this.supplierService.requestVerification(userId);
    }

    // ── Product Management ─────────────────────────────────────────────────────

    @Get('products')
    async getProducts(@Req() req: FastifyRequest) {
        const userId = requireUserId(req);
        return this.supplierService.getProducts(userId);
    }

    /**
     * POST /supplier/products
     * Handles multipart form data (product fields + images)
     * Creates a product and optionally a team deal pool.
     */
    @Post('products')
    async createProduct(@Req() req: FastifyRequest) {
        const userId = requireUserId(req);
        const parts = (req as any).parts();
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

        // Map frontend fields to the format expected by CatalogService.createProductWithImages
        const dto = {
            product_name: fields.product_name,
            description: fields.description,
            price: Number(fields.price),
            stock: Number(fields.stock),
            category: fields.category,
            categoryId: fields.categoryId,
            teamPrice: fields.teamPrice ? Number(fields.teamPrice) : undefined,
            minBuyers: fields.minBuyers ? Number(fields.minBuyers) : undefined,
            teamDealNeighbourhoodId: fields.teamDealNeighbourhoodId,
        };

        // Call catalog service to create product, upload images, and create team deal pool
        const result = await this.catalogService.createProductWithImages(userId, dto, files);
        return { id: result.id };
    }

    @Put('products/:id')
    async updateProduct(
        @Req() req: FastifyRequest,
        @Param('id') productId: string,
        @Body() data: any,
    ) {
        const userId = requireUserId(req);
        return this.supplierService.updateProduct(userId, productId, data);
    }

    @Delete('products/:id')
    async deleteProduct(
        @Req() req: FastifyRequest,
        @Param('id') productId: string,
    ) {
        const userId = requireUserId(req);
        return this.supplierService.deleteProduct(userId, productId);
    }

    // ── Orders & Logistics ─────────────────────────────────────────────────────

    @Get('orders')
    async getOrders(
        @Req() req: FastifyRequest,
        @Query('status') status?: string,
    ) {
        const userId = requireUserId(req);
        return this.supplierService.getOrders(userId, status);
    }

    @Get('purchase-orders')
    async listPurchaseOrders(@Req() req: FastifyRequest) {
        const userId = requireUserId(req);
        return this.supplierService.listPurchaseOrders(userId);
    }

    @Post('purchase-orders/:id/confirm')
    async confirmOrder(
        @Req() req: FastifyRequest,
        @Param('id') id: string,
    ) {
        const userId = requireUserId(req);
        return this.supplierService.confirmPurchaseOrder(userId, id);
    }

    @Post('purchase-orders/:id/shipped')
    async markShipped(
        @Req() req: FastifyRequest,
        @Param('id') id: string,
        @Body() body: { trackingCode?: string; note?: string },
    ) {
        const userId = requireUserId(req);
        return this.supplierService.markShipped(userId, id, body.trackingCode, body.note);
    }

    @Post('purchase-orders/:id/delivered')
    async markDelivered(
        @Req() req: FastifyRequest,
        @Param('id') id: string,
        @Body() body: { note?: string },
    ) {
        const userId = requireUserId(req);
        return this.supplierService.markDelivered(userId, id, body.note);
    }

    // ── Catalog Imports (added) ────────────────────────────────────────────────

    @Get('catalog-imports/latest')
    async latestCatalogImport(@Req() req: FastifyRequest) {
        const userId = requireUserId(req);
        return this.supplierService.getLatestCatalogImport(userId);
    }

    @Post('catalog/import')
    async importCatalog(@Req() req: FastifyRequest, @Body() body: any) {
        const userId = requireUserId(req);
        return this.supplierService.importCatalog(userId, body);
    }
}