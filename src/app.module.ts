import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { join } from 'path';
import { PrismaModule } from './prisma/prisma.module';
import { HealthController } from './health.controller';
import { OrdersModule } from './orders/orders.module';
import { PoolsModule } from './pools/pools.module';
import { SupplierModule } from './supplier/supplier.module';
import { DevModule } from './dev/dev.module';
import { CatalogModule } from './catalog/catalog.module';
import { AuthModule } from './auth/auth.module';
import { AdminController } from './admin/admin.controller';
import { AdminGuard } from './auth/admin.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 10,
    }]),
    LoggerModule.forRoot({
      pinoHttp: {
        transport: process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty' }
          : undefined,
        level: process.env.LOG_LEVEL || 'info',
      },
    }),
    // ✅ ServeStaticModule REMOVED — static files handled by @fastify/static in main.ts
    PrismaModule,
    PoolsModule,
    OrdersModule,
    SupplierModule,
    DevModule,
    CatalogModule,
    AuthModule,
  ],
  controllers: [
    HealthController,
    AdminController,
  ],
  providers: [
    AdminGuard,
  ],
})
export class AppModule { }