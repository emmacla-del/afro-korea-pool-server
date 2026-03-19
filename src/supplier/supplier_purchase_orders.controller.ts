import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { NotBlockedGuard } from '../auth/not-blocked.guard'; // 👈 changed
import { requireUserId } from '../common/auth';
import { SupplierService } from './supplier.service';

const shipSchema = z.object({
  trackingCode: z.string().min(1).max(200).optional(),
});

@Controller()
@UseGuards(NotBlockedGuard) // 👈 now uses NotBlockedGuard
export class SupplierPurchaseOrdersController {
  constructor(private readonly supplierService: SupplierService) { }

  @Get('/supplier/purchase-orders')
  async list(@Req() req: FastifyRequest) {
    const userId = requireUserId(req);
    return this.supplierService.listPurchaseOrders(userId);
  }

  @Get('/supplier/purchase-orders/summary')
  async summary(@Req() req: FastifyRequest) {
    const userId = requireUserId(req);
    return this.supplierService.getPurchaseOrdersSummary(userId);
  }

  @Post('/supplier/purchase-orders/:id/confirm')
  async confirm(@Req() req: FastifyRequest, @Param('id') purchaseOrderId: string) {
    const userId = requireUserId(req);
    return this.supplierService.confirmPurchaseOrder(userId, purchaseOrderId);
  }

  @Post('/supplier/purchase-orders/:id/ship')
  async ship(
    @Req() req: FastifyRequest,
    @Param('id') purchaseOrderId: string,
    @Body() body: unknown,
  ) {
    const userId = requireUserId(req);
    const parsed = shipSchema.parse(body);
    return this.supplierService.markShipped(userId, purchaseOrderId, parsed.trackingCode);
  }
}