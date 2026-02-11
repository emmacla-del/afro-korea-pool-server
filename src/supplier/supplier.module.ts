import { Module } from '@nestjs/common';
import { SupplierPurchaseOrdersController } from './supplier_purchase_orders.controller';
import { SupplierService } from './supplier.service';
import { PrismaModule } from '../prisma/prisma.module'; // ADD THIS

@Module({
  imports: [PrismaModule], // ADD THIS LINE
  controllers: [SupplierPurchaseOrdersController],
  providers: [SupplierService],
})
export class SupplierModule { }