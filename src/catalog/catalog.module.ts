import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { CloudinaryModule } from '../cloudinary/cloudinary.module'; // 👈 ADD

@Module({
  imports: [CloudinaryModule], // 👈 ADD
  controllers: [CatalogController],
  providers: [CatalogService],
})
export class CatalogModule { }