import { Module } from '@nestjs/common';
import { DealService } from './deal.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [DealService],
  exports: [DealService],
})
export class DealModule { }