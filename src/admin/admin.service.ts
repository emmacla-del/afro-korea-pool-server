import { Injectable, NotFoundException } from '@nestjs/common';
import { VerificationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
    constructor(private readonly prisma: PrismaService) { }

    // ── Supplier verification ─────────────────────────────────────────────────

    async getPendingSuppliers() {
        return this.prisma.supplier.findMany({
            where: { verificationStatus: VerificationStatus.PENDING },
            include: { owner: { select: { id: true, phone: true, name: true } } },
            orderBy: { createdAt: 'asc' },
        });
    }

    async setSupplierVerificationStatus(
        supplierId: string,
        status: VerificationStatus,
    ) {
        const supplier = await this.prisma.supplier.findUnique({
            where: { id: supplierId },
        });
        if (!supplier) throw new NotFoundException('Supplier not found');

        return this.prisma.supplier.update({
            where: { id: supplierId },
            data: { verificationStatus: status },
            select: {
                id: true,
                displayName: true,
                verificationStatus: true,
                owner: { select: { id: true, phone: true } },
            },
        });
    }

    // ── User blocking ─────────────────────────────────────────────────────────

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
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new NotFoundException('User not found');

        return this.prisma.user.update({
            where: { id: userId },
            data: { isBlocked: blocked },
            select: { id: true, phone: true, role: true, isBlocked: true },
        });
    }

    // ── Product management ────────────────────────────────────────────────────

    async getAllProducts() {
        return this.prisma.product.findMany({
            include: {
                supplier: {
                    select: {
                        id: true,
                        displayName: true,
                        verificationStatus: true,
                    },
                },
                images: {
                    orderBy: { order: 'asc' },
                    take: 1,
                },
                variants: {
                    where: { isActive: true },
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                },
                category_: {
                    select: { id: true, name: true, emoji: true },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    async updateProduct(
        productId: string,
        data: { title?: string; isActive?: boolean; categoryId?: string },
    ) {
        const product = await this.prisma.product.findUnique({
            where: { id: productId },
        });
        if (!product) throw new NotFoundException('Product not found');

        return this.prisma.product.update({
            where: { id: productId },
            data,
            include: {
                supplier: { select: { displayName: true } },
                category_: { select: { name: true, emoji: true } },
            },
        });
    }

    async updateProductVariant(
        productId: string,
        data: { price?: number; stock?: number },
    ) {
        const variant = await this.prisma.productVariant.findFirst({
            where: { productId },
            orderBy: { createdAt: 'desc' },
        });
        if (!variant) throw new NotFoundException('Variant not found');

        const updateData: { unitPriceXaf?: number; thresholdQty?: number } = {};
        if (data.price !== undefined) updateData.unitPriceXaf = Math.round(data.price);
        if (data.stock !== undefined) updateData.thresholdQty = data.stock;

        return this.prisma.productVariant.update({
            where: { id: variant.id },
            data: updateData,
        });
    }

    async deleteProduct(productId: string) {
        const product = await this.prisma.product.findUnique({
            where: { id: productId },
        });
        if (!product) throw new NotFoundException('Product not found');

        await this.prisma.$transaction(async (tx) => {
            const variants = await tx.productVariant.findMany({
                where: { productId },
                select: { id: true },
            });
            const variantIds = variants.map((v) => v.id);

            if (variantIds.length > 0) {
                await tx.pool.updateMany({
                    where: { variantId: { in: variantIds } },
                    data: { variantId: null },
                });
                await tx.order.updateMany({
                    where: { variantId: { in: variantIds } },
                    data: { variantId: null },
                });
                await tx.productVariant.deleteMany({ where: { productId } });
            }

            await tx.image.deleteMany({ where: { productId } });
            await tx.product.delete({ where: { id: productId } });
        });

        return { success: true, productId };
    }
}