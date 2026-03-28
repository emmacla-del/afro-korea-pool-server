import { Module } from '@nestjs/common';
import { SupplierController } from './supplier.controller';
import { SupplierService } from './supplier.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [
    SupplierController, // Only keep the new, unified controller
  ],
  providers: [SupplierService],
})
export class SupplierModule { }