import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NeighbourhoodService {
    constructor(private prisma: PrismaService) { }

    async findAll() {
        return this.prisma.neighbourhood.findMany({
            include: {
                division: {
                    include: {
                        region: true
                    }
                }
            },
            orderBy: [
                { division: { region: { name: 'asc' } } },
                { division: { name: 'asc' } },
                { name: 'asc' }
            ]
        });
    }

    async create(name: string, divisionId: string) {
        return this.prisma.neighbourhood.create({
            data: {
                name,
                division: {
                    connect: { id: divisionId }
                }
            },
        });
    }

    async update(id: string, name: string) {
        try {
            return await this.prisma.neighbourhood.update({
                where: { id },
                data: { name },
            });
        } catch {
            throw new NotFoundException('Neighbourhood not found');
        }
    }

    async delete(id: string) {
        try {
            await this.prisma.neighbourhood.delete({ where: { id } });
            return { success: true };
        } catch {
            throw new NotFoundException('Neighbourhood not found');
        }
    }
}