import { Body, Controller, Get, Param, Post, Req, UseGuards, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { NotBlockedGuard } from '../auth/not-blocked.guard';
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
  productId: z.string().uuid(),          // 👈 changed from variantId
  teamPrice: z.number().int().positive(),
  minBuyers: z.number().int().min(2).optional().default(2),
  neighbourhoodId: z.string().uuid().optional(),
});

@Controller()
export class PoolsController {
  constructor(
    private readonly poolsService: PoolsService,
    private readonly prisma: PrismaService,
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
  @UseGuards(NotBlockedGuard)
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
  @UseGuards(NotBlockedGuard)
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
      parsed.productId,                   // 👈 changed from parsed.variantId
      parsed.teamPrice,
      parsed.minBuyers,
      parsed.neighbourhoodId,
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
  @UseGuards(NotBlockedGuard)
  async joinTeamDeal(@Req() req: FastifyRequest, @Param('id') poolId: string) {
    const userId = requireUserId(req);
    return this.poolsService.joinTeamDeal(userId, poolId);
  }

  // --- NEW: Get active team deal for a product variant ---
  /**
   * Returns the first open team deal pool for the given variant ID.
   * Used by the frontend to determine whether to show "Join Group" or "Start Group".
   */
  @Get('/pools/variant/:variantId/active')
  async getActiveTeamDealForVariant(@Param('variantId') variantId: string) {
    return this.poolsService.getActiveTeamDealForVariant(variantId);
  }
}