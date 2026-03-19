// src/category/category.controller.ts

import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Param,
    Body,
    UseGuards,
    HttpCode,
    HttpStatus,
} from '@nestjs/common';
import { CategoryService } from './category.service';
import { AdminGuard } from '../auth/admin.guard';

// ── Public: GET /categories ───────────────────────────────────────────────────
// No auth required — used by home page shelves and supplier product form.

@Controller('categories')
export class CategoryController {
    constructor(private readonly categoryService: CategoryService) { }

    @Get()
    findAll() {
        return this.categoryService.findAll();
    }
}

// ── Admin: /admin/categories ──────────────────────────────────────────────────
// All routes require ADMIN role via your existing AdminGuard.

@Controller('admin/categories')
@UseGuards(AdminGuard)
export class AdminCategoryController {
    constructor(private readonly categoryService: CategoryService) { }

    @Get()
    findAll() {
        return this.categoryService.findAllAdmin();
    }

    @Post()
    create(
        @Body()
        body: {
            name: string;
            emoji: string;
            slug: string;
            sortOrder?: number;
        },
    ) {
        return this.categoryService.create(body);
    }

    @Patch(':id')
    update(
        @Param('id') id: string,
        @Body()
        body: {
            name?: string;
            emoji?: string;
            sortOrder?: number;
            isActive?: boolean;
        },
    ) {
        return this.categoryService.update(id, body);
    }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    remove(@Param('id') id: string) {
        return this.categoryService.remove(id);
    }
}