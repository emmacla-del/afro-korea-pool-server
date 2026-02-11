import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { HealthController } from './health.controller';
import { OrdersModule } from './orders/orders.module';
import { PoolsModule } from './pools/pools.module';
import { SupplierModule } from './supplier/supplier.module';
import { DevModule } from './dev/dev.module';
import { CatalogModule } from './catalog/catalog.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    PoolsModule,
    OrdersModule,
    SupplierModule,
    DevModule,
    CatalogModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
