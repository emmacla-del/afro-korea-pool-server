// src/interaction/interaction.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InteractionType } from '@prisma/client';

@Injectable()
export class InteractionService {
  private readonly logger = new Logger(InteractionService.name);

  constructor(private prisma: PrismaService) { }

  /**
   * Tracks raw interactions and updates aggregated product stats.
   * This fuels the 'popularity' and 'trending' sorts in ProductService.
   */
  async trackInteraction(userId: string, productId: string, type: InteractionType) {
    try {
      // 1. Log the individual event for Collaborative Filtering
      await this.prisma.userProductInteraction.create({
        data: { userId, productId, type },
      });

      // 2. Update the ProductStats (Aggregated Score)
      // Different weights: VIEW = 1, LIKE = 5, SHARE = 10
      const weightMap: Record<InteractionType, number> = {
        [InteractionType.VIEW]: 1,
        [InteractionType.LIKE]: 5,
        [InteractionType.SHARE]: 10,
      };

      const incrementValue = weightMap[type] || 1;

      await this.prisma.productStats.upsert({
        where: { productId },
        update: {
          score: { increment: incrementValue },
          views: type === InteractionType.VIEW ? { increment: 1 } : undefined,
          // Add more specific increments here if your schema has them
        },
        create: {
          productId,
          score: incrementValue,
          views: type === InteractionType.VIEW ? 1 : 0,
        },
      });
    } catch (err) {
      const errMessage = err instanceof Error ? err.message : String(err);
      this.logger.error(`Error tracking interaction: ${errMessage}`);
      throw err;
    }
  }
}