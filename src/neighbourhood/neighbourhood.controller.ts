import { Controller, Get, Post, Body, Param, Patch, Delete, UseGuards, BadRequestException } from '@nestjs/common';
import { NeighbourhoodService } from './neighbourhood.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';

@Controller('neighbourhoods')
export class NeighbourhoodController {
    constructor(private readonly neighbourhoodService: NeighbourhoodService) { }

    @Get()
    async findAll() {
        return this.neighbourhoodService.findAll();
    }

    @Post()
    @UseGuards(JwtAuthGuard, AdminGuard)
    async create(@Body('name') name: string, @Body('divisionId') divisionId: string) {
        if (!divisionId) {
            throw new BadRequestException('divisionId is required');
        }
        return this.neighbourhoodService.create(name, divisionId);
    }

    @Patch(':id')
    @UseGuards(JwtAuthGuard, AdminGuard)
    async update(@Param('id') id: string, @Body('name') name: string) {
        return this.neighbourhoodService.update(id, name);
    }

    @Delete(':id')
    @UseGuards(JwtAuthGuard, AdminGuard)
    async delete(@Param('id') id: string) {
        return this.neighbourhoodService.delete(id);
    }
}