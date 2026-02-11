import { Module } from '@nestjs/common';
import { PoolsController } from './pools.controller';
import { PoolsSchedulerService } from './pools.scheduler';
import { PoolsService } from './pools.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],  // ← Add this line
  controllers: [PoolsController],
  providers: [PoolsService, PoolsSchedulerService],
  exports: [PoolsService],
})
export class PoolsModule { }