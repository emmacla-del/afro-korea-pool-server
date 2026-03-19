// src/category/category.module.ts

import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CategoryService } from './category.service';
import { CategoryController, AdminCategoryController } from './category.controller';

@Module({
    imports: [PrismaModule],
    controllers: [CategoryController, AdminCategoryController],
    providers: [CategoryService],
    exports: [CategoryService],
})
export class CategoryModule { }