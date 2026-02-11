import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireUserId } from '../common/auth';
import { PoolsService } from './pools.service';

const createPoolSchema = z.object({
  variantId: z.string().uuid(),
  deadlineAt: z.string().datetime(),
});

const commitSchema = z.object({
  qty: z.number().int().min(0).max(100000),
});

@Controller()
export class PoolsController {
  constructor(private readonly poolsService: PoolsService) {}

  @Post('/pools')
  async createPool(@Body() body: unknown) {
    const parsed = createPoolSchema.parse(body);
    return this.poolsService.createPool({
      variantId: parsed.variantId,
      deadlineAt: new Date(parsed.deadlineAt),
    });
  }

  @Get('/pools/:id')
  async getPool(@Param('id') id: string) {
    return this.poolsService.getPool(id);
  }

  @Post('/pools/:id/commit')
  async commit(@Req() req: FastifyRequest, @Param('id') poolId: string, @Body() body: unknown) {
    const userId = requireUserId(req);
    const parsed = commitSchema.parse(body);
    return this.poolsService.commitToPool({
      poolId,
      userId,
      qty: parsed.qty,
    });
  }
}
