import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  // ✅ Use the 'this' context correctly for model access
  get userModel() { return this.user; }
  get rewardTransactionModel() { return this.rewardTransaction; }
  get referralTransactionModel() { return this.referralTransaction; }

  // Note: Since we are extending PrismaClient, 
  // 'this.rewardTransaction' actually exists automatically, 
  // but TypeScript needs a nudge sometimes.

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('✅ Prisma connected successfully to Render DB');
    } catch (err) {
      this.logger.error('❌ Prisma connection failed', err);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}