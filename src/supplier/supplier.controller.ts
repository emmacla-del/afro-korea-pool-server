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

@Controller('supplier')
@UseGuards(NotBlockedGuard)
export class SupplierController {
    constructor(private readonly supplierService: SupplierService) { }

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

    @Post('products')
    async createProduct(
        @Req() req: FastifyRequest,
        @Body() dto: CreateProductDto,
    ) {
        const userId = requireUserId(req);
        return this.supplierService.createProduct(userId, dto);
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
}