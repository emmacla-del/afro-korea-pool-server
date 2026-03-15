import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly client: PrismaClient;

  // Expose all model accessors
  get user() { return this.client.user; }
  get supplier() { return this.client.supplier; }
  get product() { return this.client.product; }
  get productVariant() { return this.client.productVariant; }
  get image() { return this.client.image; }
  get pool() { return this.client.pool; }
  get commitment() { return this.client.commitment; }
  get order() { return this.client.order; }
  get payment() { return this.client.payment; }
  get purchaseOrder() { return this.client.purchaseOrder; }
  get purchaseOrderItem() { return this.client.purchaseOrderItem; }
  get fulfillmentEvent() { return this.client.fulfillmentEvent; }
  get userCheckIn() { return this.client.userCheckIn; } // ✅ ADDED

  // Expose raw query methods
  get $queryRaw() { return this.client.$queryRaw.bind(this.client); }
  get $executeRaw() { return this.client.$executeRaw.bind(this.client); }
  get $transaction() { return this.client.$transaction.bind(this.client); }
  get $connect() { return this.client.$connect.bind(this.client); }
  get $disconnect() { return this.client.$disconnect.bind(this.client); }

  constructor() {
    this.client = new PrismaClient();
  }

  async onModuleInit() {
    let retries = 5;
    while (retries > 0) {
      try {
        await this.client.$connect();
        this.logger.log('✅ Prisma connected successfully');
        return;
      } catch (err) {
        retries--;
        this.logger.warn(`⚠️ Prisma connection failed, retrying... (${retries} attempts left)`);
        if (retries === 0) throw err;
        await new Promise(r => setTimeout(r, 3000));
      }
    }
  }

  async onModuleDestroy() {
    await this.client.$disconnect();
  }
}