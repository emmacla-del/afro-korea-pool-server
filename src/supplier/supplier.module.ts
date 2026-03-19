import { Module } from '@nestjs/common';
import { SupplierPurchaseOrdersController } from './supplier_purchase_orders.controller';
import { SupplierController } from './supplier.controller'; // 👈 new controller
import { SupplierService } from './supplier.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [
    SupplierPurchaseOrdersController,
    SupplierController, // 👈 added here
  ],
  providers: [SupplierService],
})
export class SupplierModule { }