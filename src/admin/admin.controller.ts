import { Controller, Get, Patch, Param, UseGuards, ForbiddenException, Req } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

@Controller('admin')
@UseGuards(JwtAuthGuard)
export class AdminController {
    constructor(private prisma: PrismaService) { }

    private async checkAdmin(userId: string) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user || user.role !== 'ADMIN') {
            throw new ForbiddenException('Admin access required');
        }
    }

    @Get('suppliers/pending')
    async getPendingSuppliers(@Req() req: FastifyRequest) {
        const userId = (req as any).user?.sub; // type assertion
        await this.checkAdmin(userId);
        return this.prisma.supplier.findMany({
            where: { verificationStatus: 'PENDING' },
            include: { owner: { select: { phone: true } } },
        });
    }

    @Patch('suppliers/:id/verify')
    async verifySupplier(@Req() req: FastifyRequest, @Param('id') supplierId: string) {
        const userId = (req as any).user?.sub;
        await this.checkAdmin(userId);
        return this.prisma.supplier.update({
            where: { id: supplierId },
            data: { verificationStatus: 'VERIFIED' },
        });
    }

    @Patch('suppliers/:id/reject')
    async rejectSupplier(@Req() req: FastifyRequest, @Param('id') supplierId: string) {
        const userId = (req as any).user?.sub;
        await this.checkAdmin(userId);
        return this.prisma.supplier.update({
            where: { id: supplierId },
            data: { verificationStatus: 'REJECTED' },
        });
    }
}