import { Module } from '@nestjs/common';
import { SupplierController } from './supplier.controller';
import { SupplierService } from './supplier.service';
import { PrismaModule } from '../prisma/prisma.module';
import { CatalogModule } from '../catalog/catalog.module'; // 👈 import

@Module({
  imports: [PrismaModule, CatalogModule], // 👈 add CatalogModule
  controllers: [SupplierController],
  providers: [SupplierService], // CatalogService is provided by CatalogModule
})
export class SupplierModule { }