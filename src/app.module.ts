import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler'; // <-- ADD THIS
import { LoggerModule } from 'nestjs-pino'; // <-- ADD THIS
import { PrismaModule } from './prisma/prisma.module';
import { HealthController } from './health.controller';
import { OrdersModule } from './orders/orders.module';
import { PoolsModule } from './pools/pools.module';
import { SupplierModule } from './supplier/supplier.module';
import { DevModule } from './dev/dev.module';
import { CatalogModule } from './catalog/catalog.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{   // <-- ADD THIS
      ttl: 60000,
      limit: 10,
    }]),
    LoggerModule.forRoot({       // <-- ADD THIS
      pinoHttp: {
        transport: process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty' }
          : undefined,
        level: process.env.LOG_LEVEL || 'info',
      },
    }),
    PrismaModule,
    PoolsModule,
    OrdersModule,
    SupplierModule,
    DevModule,
    CatalogModule,
    AuthModule,
  ],
  controllers: [HealthController],
})
export class AppModule { }