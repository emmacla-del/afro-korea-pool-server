import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { PrismaModule } from './prisma/prisma.module';
import { CloudinaryModule } from './cloudinary/cloudinary.module';
import { CheckinModule } from './checkin/checkin.module';
import { NeighbourhoodModule } from './neighbourhood/neighbourhood.module';
import { HealthController } from './health.controller';
import { OrdersModule } from './orders/orders.module';
import { PoolsModule } from './pools/pools.module';
import { SupplierModule } from './supplier/supplier.module';
import { DevModule } from './dev/dev.module';
import { CatalogModule } from './catalog/catalog.module';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module'; // 👈 new
import { AdminGuard } from './auth/admin.guard';
import { NotBlockedGuard } from './auth/not-blocked.guard'; // 👈 new
import { UserModule } from './user/user.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 10 }]),
    LoggerModule.forRoot({
      pinoHttp: {
        transport: process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty' }
          : undefined,
        level: process.env.LOG_LEVEL || 'info',
      },
    }),
    PrismaModule,
    CloudinaryModule,
    CheckinModule,
    NeighbourhoodModule,
    PoolsModule,
    OrdersModule,
    SupplierModule,
    DevModule,
    CatalogModule,
    AuthModule,
    AdminModule, // 👈 replaces direct AdminController + AdminService
    UserModule,
  ],
  controllers: [HealthController],
  providers: [AdminGuard, NotBlockedGuard], // 👈 AdminService moved into AdminModule
})
export class AppModule { }