// ─── src/category/category.service.ts ────────────────────────────────────────

import {
    Injectable,
    NotFoundException,
    ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CategoryService {
    constructor(private readonly prisma: PrismaService) { }

    // ── Public ────────────────────────────────────────────────────────────────

    async findAll() {
        return this.prisma.category.findMany({
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' },
        });
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    async findAllAdmin() {
        return this.prisma.category.findMany({
            orderBy: { sortOrder: 'asc' },
            include: { _count: { select: { products: true } } },
        });
    }

    async create(data: {
        name: string;
        emoji: string;
        slug: string;
        sortOrder?: number;
    }) {
        const existing = await this.prisma.category.findUnique({
            where: { slug: data.slug },
        });
        if (existing) throw new ConflictException('Category slug already exists');

        return this.prisma.category.create({
            data: {
                name: data.name,
                emoji: data.emoji,
                slug: data.slug.toUpperCase().replace(/\s+/g, '_'),
                sortOrder: data.sortOrder ?? 0,
                isActive: true,
            },
        });
    }

    async update(
        id: string,
        data: {
            name?: string;
            emoji?: string;
            sortOrder?: number;
            isActive?: boolean;
        },
    ) {
        const category = await this.prisma.category.findUnique({ where: { id } });
        if (!category) throw new NotFoundException('Category not found');

        return this.prisma.category.update({
            where: { id },
            data,
        });
    }

    async remove(id: string) {
        const category = await this.prisma.category.findUnique({ where: { id } });
        if (!category) throw new NotFoundException('Category not found');

        // Soft delete — deactivate instead of hard delete
        return this.prisma.category.update({
            where: { id },
            data: { isActive: false },
        });
    }
}


// ─── src/category/category.controller.ts ─────────────────────────────────────

import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Param,
    Body,
    UseGuards,
} from '@nestjs/common';
import { NotBlockedGuard } from '../auth/not-blocked.guard';
import { AdminGuard } from '../auth/admin.guard';

// Public endpoint — no auth required
@Controller('categories')
export class CategoryController {
    constructor(private readonly categoryService: CategoryService) { }

    @Get()
    findAll() {
        return this.categoryService.findAll();
    }
}

// Admin endpoints
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
    remove(@Param('id') id: string) {
        return this.categoryService.remove(id);
    }
}


// ─── src/category/category.module.ts ─────────────────────────────────────────

import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    controllers: [CategoryController, AdminCategoryController],
    providers: [CategoryService],
    exports: [CategoryService],
})
export class CategoryModule { }


// ─── In app.module.ts — add to imports array ──────────────────────────────────
// import { CategoryModule } from './category/category.module';
// imports: [ ..., CategoryModule ],