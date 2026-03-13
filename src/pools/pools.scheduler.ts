import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PoolsService } from './pools.service';

@Injectable()
export class PoolsSchedulerService {
  private readonly logger = new Logger(PoolsSchedulerService.name);
  private _ready = false;

  constructor(
    @Inject(forwardRef(() => PoolsService))
    private readonly poolsService: PoolsService,
  ) {
    // Verified: poolsService is now correctly injected
    console.log('✅ PoolsSchedulerService constructor, poolsService exists:', !!this.poolsService);

    // Warm-up period to ensure DB and other services are fully settled
    setTimeout(() => {
      this._ready = true;
      this.logger.log('Scheduler is now active');
    }, 30_000);
  }

  private isWorkerEnabled() {
    const raw = process.env.JOB_WORKER_ENABLED ?? 'true';
    return raw.toLowerCase() === 'true';
  }

  @Interval(15_000)
  async tick() {
    if (!this.isWorkerEnabled()) return;

    // Safety check: ensure service is ready and dependency is not null
    if (!this._ready || !this.poolsService) {
      return;
    }

    try {
      await this.poolsService.expireOpenPastDeadline();
      await this.poolsService.finalizePaymentWindowsPastDeadline();
    } catch (error) {
      // Fixes the TypeScript "unknown" error type-safety check
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error during scheduler tick: ${errorMessage}`);
    }
  }
}