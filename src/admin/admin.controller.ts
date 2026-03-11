import { Controller, Get, Patch, Param, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard';
import { PrismaService } from '../prisma/prisma.service';

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
    constructor(private prisma: PrismaService) { }

    @Get('suppliers/pending')
    async getPendingSuppliers() {
        return this.prisma.supplier.findMany({
            where: { verificationStatus: 'PENDING' },
            include: { owner: { select: { phone: true } } },
        });
    }

    @Patch('suppliers/:id/verify')
    async verifySupplier(@Param('id') supplierId: string) {
        return this.prisma.supplier.update({
            where: { id: supplierId },
            data: { verificationStatus: 'VERIFIED' },
        });
    }

    @Patch('suppliers/:id/reject')
    async rejectSupplier(@Param('id') supplierId: string) {
        return this.prisma.supplier.update({
            where: { id: supplierId },
            data: { verificationStatus: 'REJECTED' },
        });
    }
}