import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { PrismaModule } from '../prisma/prisma.module'; // ADD THIS

@Module({
  imports: [PrismaModule], // ADD THIS LINE
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule { }