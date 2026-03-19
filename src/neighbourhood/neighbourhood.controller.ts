import { Controller, Get, Post, Body, Param, Patch, Delete, UseGuards, BadRequestException } from '@nestjs/common';
import { NeighbourhoodService } from './neighbourhood.service';
import { NotBlockedGuard } from '../auth/not-blocked.guard'; // 👈 changed
import { AdminGuard } from '../auth/admin.guard';

@Controller('neighbourhoods')
export class NeighbourhoodController {
    constructor(private readonly neighbourhoodService: NeighbourhoodService) { }

    @Get()
    async findAll() {
        return this.neighbourhoodService.findAll();
    }

    @Post()
    @UseGuards(NotBlockedGuard, AdminGuard) // 👈 now uses NotBlockedGuard + AdminGuard
    async create(@Body('name') name: string, @Body('divisionId') divisionId: string) {
        if (!divisionId) {
            throw new BadRequestException('divisionId is required');
        }
        return this.neighbourhoodService.create(name, divisionId);
    }

    @Patch(':id')
    @UseGuards(NotBlockedGuard, AdminGuard) // 👈 changed
    async update(@Param('id') id: string, @Body('name') name: string) {
        return this.neighbourhoodService.update(id, name);
    }

    @Delete(':id')
    @UseGuards(NotBlockedGuard, AdminGuard) // 👈 changed
    async delete(@Param('id') id: string) {
        return this.neighbourhoodService.delete(id);
    }
}