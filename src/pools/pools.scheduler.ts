import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PoolStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PoolsService } from './pools.service';

@Injectable()
export class PoolsSchedulerService {
  private readonly logger = new Logger(PoolsSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly poolsService: PoolsService,
  ) {}

  private isWorkerEnabled() {
    const raw = process.env.JOB_WORKER_ENABLED ?? 'true';
    return raw.toLowerCase() === 'true';
  }

  @Interval(15_000)
  async tick() {
    if (!this.isWorkerEnabled()) return;

    const now = new Date();

    const expiredCandidates = await this.prisma.pool.findMany({
      where: { status: PoolStatus.OPEN, deadlineAt: { lte: now } },
      select: { id: true },
      take: 50,
    });

    for (const pool of expiredCandidates) {
      try {
        await this.poolsService.expirePoolIfPastDeadline(pool.id);
      } catch (err) {
        this.logger.warn({ poolId: pool.id, err }, 'expirePoolIfPastDeadline failed');
      }
    }

    const finalizeCandidates = await this.prisma.pool.findMany({
      where: { status: PoolStatus.PAYMENT_WINDOW, paymentWindowEndsAt: { lte: now } },
      select: { id: true },
      take: 50,
    });

    for (const pool of finalizeCandidates) {
      try {
        await this.poolsService.finalizePoolIfNeeded(pool.id);
      } catch (err) {
        this.logger.warn({ poolId: pool.id, err }, 'finalizePoolIfNeeded failed');
      }
    }
  }
}
