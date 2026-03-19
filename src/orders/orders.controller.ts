import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { NotBlockedGuard } from '../auth/not-blocked.guard'; // 👈 changed
import { requireDevAdminSecret, requireUserId } from '../common/auth';
import { OrdersService } from './orders.service';
import { z } from 'zod';

const directOrderSchema = z.object({
  variantId: z.string().uuid(),
  qty: z.number().int().min(1).max(100000),
});

@Controller()
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) { }

  @Get('/me/orders')
  @UseGuards(NotBlockedGuard) // 👈 changed
  async myOrders(@Req() req: FastifyRequest) {
    const userId = requireUserId(req);
    return this.ordersService.listOrdersForUser(userId);
  }

  @Get('/orders/:id')
  @UseGuards(NotBlockedGuard) // 👈 changed
  async getOrder(@Req() req: FastifyRequest, @Param('id') orderId: string) {
    const userId = requireUserId(req);
    return this.ordersService.getOrderForUser({ userId, orderId });
  }

  @Post('/orders/direct')
  @UseGuards(NotBlockedGuard) // 👈 changed
  async createDirectOrder(@Req() req: FastifyRequest, @Body() body: unknown) {
    const userId = requireUserId(req);
    const parsed = directOrderSchema.parse(body);
    return this.ordersService.createDirectOrder({
      userId,
      variantId: parsed.variantId,
      qty: parsed.qty,
    });
  }

  @Post('/dev/orders/:id/mark-paid')
  async markPaid(@Req() req: FastifyRequest, @Param('id') orderId: string) {
    requireDevAdminSecret(req);
    return this.ordersService.devMarkOrderPaid(orderId);
  }
}