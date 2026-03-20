import {
    Controller,
    Get,
    Post,
    Query,
    Req,
    UseGuards,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { NotBlockedGuard } from '../auth/not-blocked.guard';
import { requireUserId } from '../common/auth';
import { SupplierService } from './supplier.service';

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
}