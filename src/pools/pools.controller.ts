import { Body, Controller, Get, Param, Post, Req, UseGuards, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { requireUserId } from '../common/auth';
import { PoolsService } from './pools.service';
import { PrismaService } from '../prisma/prisma.service';

// Validation schemas
const createPoolSchema = z.object({
  variantId: z.string().uuid(),
  deadlineAt: z.string().datetime(),
});

const commitSchema = z.object({
  qty: z.number().int().min(0).max(100000),
});

const createTeamDealSchema = z.object({
  variantId: z.string().uuid(),
  teamPrice: z.number().int().positive(),
  minBuyers: z.number().int().min(2).optional().default(2),
});

@Controller()
export class PoolsController {
  constructor(
    private readonly poolsService: PoolsService,
    private readonly prisma: PrismaService, // 👈 added for supplier check
  ) { }

  // --- Existing endpoints ---
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
  @UseGuards(JwtAuthGuard)
  async commit(@Req() req: FastifyRequest, @Param('id') poolId: string, @Body() body: unknown) {
    const userId = requireUserId(req);
    const parsed = commitSchema.parse(body);
    return this.poolsService.commitToPool({
      poolId,
      userId,
      qty: parsed.qty,
    });
  }

  // --- New team deal endpoints ---

  /**
   * Supplier creates a team deal (Pinduoduo-style)
   */
  @Post('/pools/team')
  @UseGuards(JwtAuthGuard)
  async createTeamDeal(@Req() req: FastifyRequest, @Body() body: unknown) {
    const userId = requireUserId(req);
    const parsed = createTeamDealSchema.parse(body);

    // Verify user is a supplier
    const supplier = await this.prisma.supplier.findUnique({
      where: { ownerUserId: userId },
    });
    if (!supplier) {
      throw new UnauthorizedException('Only suppliers can create team deals');
    }

    return this.poolsService.createTeamDeal(
      supplier.id,
      parsed.variantId,
      parsed.teamPrice,
      parsed.minBuyers,
    );
  }

  /**
   * List all open team deals (for customers)
   */
  @Get('/pools/team')
  async getOpenTeamDeals() {
    return this.poolsService.getOpenTeamDeals();
  }

  /**
   * Customer joins a team deal
   */
  @Post('/pools/:id/join')
  @UseGuards(JwtAuthGuard)
  async joinTeamDeal(@Req() req: FastifyRequest, @Param('id') poolId: string) {
    const userId = requireUserId(req);
    return this.poolsService.joinTeamDeal(userId, poolId);
  }
}