import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
    constructor(private prisma: PrismaService) { }

    // ---- Supplier verification ----

    async getPendingSuppliers() {
        return this.prisma.supplier.findMany({
            where: { verificationStatus: 'PENDING' },
            include: {
                owner: {
                    select: {
                        phone: true,
                        name: true,
                    },
                },
            },
        });
    }

    async verifySupplier(supplierId: string) {
        const supplier = await this.prisma.supplier.findUnique({
            where: { id: supplierId },
        });
        if (!supplier) throw new NotFoundException('Supplier not found');

        return this.prisma.supplier.update({
            where: { id: supplierId },
            data: { verificationStatus: 'VERIFIED' },
        });
    }

    async rejectSupplier(supplierId: string) {
        const supplier = await this.prisma.supplier.findUnique({
            where: { id: supplierId },
        });
        if (!supplier) throw new NotFoundException('Supplier not found');

        return this.prisma.supplier.update({
            where: { id: supplierId },
            data: { verificationStatus: 'REJECTED' },
        });
    }

    // ---- User management ----

    async getAllUsers() {
        return this.prisma.user.findMany({
            select: {
                id: true,
                name: true,
                phone: true,
                role: true,
                isBlocked: true,
                createdAt: true,
                supplier: {
                    select: {
                        id: true,
                        displayName: true,
                        verificationStatus: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    async setUserBlockStatus(userId: string, blocked: boolean) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
        });
        if (!user) throw new NotFoundException('User not found');

        return this.prisma.user.update({
            where: { id: userId },
            data: { isBlocked: blocked },
            select: {
                id: true,
                phone: true,
                role: true,
                isBlocked: true,
            },
        });
    }
}