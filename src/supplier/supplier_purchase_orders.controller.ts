import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { NotBlockedGuard } from '../auth/not-blocked.guard';
import { requireUserId } from '../common/auth';
import { SupplierService } from './supplier.service';

// ── Validation schemas ─────────────────────────────────────────────────────

const shipSchema = z.object({
  trackingCode: z.string().min(1).max(200).optional(),
  note: z.string().max(500).optional(),
});

const deliverSchema = z.object({
  note: z.string().max(500).optional(),
});

// ══════════════════════════════════════════════════════════════════════════════

@Controller()
@UseGuards(NotBlockedGuard)
export class SupplierPurchaseOrdersController {
  constructor(private readonly supplierService: SupplierService) { }

  /**
   * GET /supplier/purchase-orders
   */
  @Get('/supplier/purchase-orders')
  async list(@Req() req: FastifyRequest) {
    const userId = requireUserId(req);
    return this.supplierService.listPurchaseOrders(userId);
  }

  /**
   * GET /supplier/purchase-orders/summary
   */
  @Get('/supplier/purchase-orders/summary')
  async summary(@Req() req: FastifyRequest) {
    const userId = requireUserId(req);
    return this.supplierService.getPurchaseOrdersSummary(userId);
  }

  /**
   * POST /supplier/purchase-orders/:id/confirm
   */
  @Post('/supplier/purchase-orders/:id/confirm')
  async confirm(
    @Req() req: FastifyRequest,
    @Param('id') purchaseOrderId: string,
  ) {
    const userId = requireUserId(req);
    return this.supplierService.confirmPurchaseOrder(userId, purchaseOrderId);
  }

  /**
   * POST /supplier/purchase-orders/:id/ship
   * Body: { trackingCode?: string; note?: string }
   */
  @Post('/supplier/purchase-orders/:id/ship')
  async ship(
    @Req() req: FastifyRequest,
    @Param('id') purchaseOrderId: string,
    @Body() body: unknown,
  ) {
    const userId = requireUserId(req);
    const parsed = shipSchema.parse(body ?? {});
    return this.supplierService.markShipped(
      userId,
      purchaseOrderId,
      parsed.trackingCode,
      parsed.note,
    );
  }

  /**
   * POST /supplier/purchase-orders/:id/deliver
   * Body: { note?: string }
   */
  @Post('/supplier/purchase-orders/:id/deliver')
  async deliver(
    @Req() req: FastifyRequest,
    @Param('id') purchaseOrderId: string,
    @Body() body: unknown,
  ) {
    const userId = requireUserId(req);
    const parsed = deliverSchema.parse(body ?? {});
    return this.supplierService.markDelivered(
      userId,
      purchaseOrderId,
      parsed.note,
    );
  }
}