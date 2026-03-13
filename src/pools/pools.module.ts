import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module'; // adjust path if needed
import { PoolsController } from './pools.controller';
import { PoolsSchedulerService } from './pools.scheduler';
import { PoolsService } from './pools.service';

@Module({
  imports: [PrismaModule],          // 👈 add this
  controllers: [PoolsController],
  providers: [PoolsService, PoolsSchedulerService],
  exports: [PoolsService],
})
export class PoolsModule { }