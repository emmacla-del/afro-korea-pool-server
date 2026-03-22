import { Injectable, NotFoundException } from '@nestjs/common';
import { VerificationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
    constructor(private readonly prisma: PrismaService) { }

    // ── Supplier Verification & Nudging ──────────────────────────────────────────

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

    async bulkSetSupplierVerification(supplierIds: string[], status: VerificationStatus) {
        return this.prisma.$transaction(
            supplierIds.map((id) =>
                this.prisma.supplier.update({
                    where: { id },
                    data: { verificationStatus: status },
                }),
            ),
        );
    }

    async sendSupplierNudge(supplierId: string, message: string) {
        const supplier = await this.prisma.supplier.findUnique({
            where: { id: supplierId },
            include: { owner: true },
        });
        if (!supplier) throw new NotFoundException('Supplier not found');

        console.log(`[ADMIN NUDGE] Sent to ${supplier.displayName}: ${message}`);
        return { success: true, recipient: supplier.displayName, timestamp: new Date() };
    }

    // ── User Management ────────────────────────────────────────────────────────

    async getAllUsers(filters: {
        page?: number;
        pageSize?: number;
        search?: string;
        role?: string;
        blocked?: string;
        sortBy?: string;
    } = {}) {
        const page = Math.max(1, Number(filters.page) || 1);
        const pageSize = Math.min(100, Number(filters.pageSize) || 50);
        const skip = (page - 1) * pageSize;

        const where: any = {};
        if (filters.search) {
            where.OR = [
                { name: { contains: filters.search, mode: 'insensitive' } },
                { phone: { contains: filters.search, mode: 'insensitive' } },
            ];
        }
        if (filters.role && filters.role !== 'ALL') where.role = filters.role;
        if (filters.blocked === 'true') where.isBlocked = true;
        else if (filters.blocked === 'false') where.isBlocked = false;

        const [sortField, sortDir] = (filters.sortBy ?? 'createdAt_desc').split('_');
        const orderBy = { [sortField]: sortDir === 'asc' ? 'asc' : 'desc' };

        const [users, total] = await this.prisma.$transaction([
            this.prisma.user.findMany({
                where,
                select: {
                    id: true,
                    name: true,
                    phone: true,
                    role: true,
                    isBlocked: true,
                    createdAt: true,
                    supplier: { select: { id: true, displayName: true, verificationStatus: true } },
                },
                orderBy, skip, take: pageSize,
            }),
            this.prisma.user.count({ where }),
        ]);
        return { users, total };
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

    // ── Product Management ─────────────────────────────────────────────────────

    async getAllProducts() {
        return this.prisma.product.findMany({
            include: {
                supplier: { select: { id: true, displayName: true, verificationStatus: true } },
                images: { orderBy: { order: 'asc' }, take: 1 },
                variants: { where: { isActive: true }, orderBy: { createdAt: 'desc' }, take: 1 },
                category_: { select: { id: true, name: true, emoji: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    async updateProduct(productId: string, data: { title?: string; isActive?: boolean; categoryId?: string }) {
        const product = await this.prisma.product.findUnique({ where: { id: productId } });
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

    /**
     * FIXED: Explicitly mapping priceXaf and stock to satisfy Prisma types.
     * Prevents TS2322 error.
     */
    async updateProductVariant(productId: string, data: { price?: number; stock?: number }) {
        const variant = await this.prisma.productVariant.findFirst({
            where: { productId, isActive: true },
            orderBy: { createdAt: 'desc' },
        });
        if (!variant) throw new NotFoundException('Active variant not found');

        const updateData: any = {};
        if (data.price !== undefined) updateData.priceXaf = data.price;
        if (data.stock !== undefined) updateData.stock = data.stock;

        return this.prisma.productVariant.update({
            where: { id: variant.id },
            data: updateData,
        });
    }

    async bulkToggleProducts(productIds: string[], isActive: boolean) {
        return this.prisma.product.updateMany({
            where: { id: { in: productIds } },
            data: { isActive },
        });
    }

    async bulkDeleteProducts(productIds: string[]) {
        return this.prisma.$transaction(async (tx) => {
            const variants = await tx.productVariant.findMany({
                where: { productId: { in: productIds } },
                select: { id: true },
            });
            const variantIds = variants.map((v) => v.id);
            if (variantIds.length > 0) {
                await tx.pool.updateMany({ where: { variantId: { in: variantIds } }, data: { variantId: null } });
                await tx.order.updateMany({ where: { variantId: { in: variantIds } }, data: { variantId: null } });
                await tx.productVariant.deleteMany({ where: { productId: { in: productIds } } });
            }
            await tx.image.deleteMany({ where: { productId: { in: productIds } } });
            return await tx.product.deleteMany({ where: { id: { in: productIds } } });
        });
    }

    async deleteProduct(productId: string) {
        return this.bulkDeleteProducts([productId]);
    }

    // ── Order Management ───────────────────────────────────────────────────────

    async getAllOrders(filters: { status?: string; neighbourhoodId?: string; dateFrom?: string; dateTo?: string }) {
        const where: any = {};
        if (filters.status) where.status = filters.status;
        if (filters.dateFrom || filters.dateTo) {
            where.createdAt = {
                ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
                ...(filters.dateTo ? { lte: new Date(filters.dateTo) } : {}),
            };
        }
        if (filters.neighbourhoodId) {
            where.OR = [
                { user: { neighbourhoodId: filters.neighbourhoodId } },
                { pool: { neighbourhoodId: filters.neighbourhoodId } },
            ];
        }
        return this.prisma.order.findMany({
            where,
            include: {
                user: { select: { id: true, name: true, phone: true, neighbourhoodId: true } },
                supplier: { select: { id: true, displayName: true } },
                variant: { include: { product: { select: { id: true, title: true } } } },
                pool: { select: { id: true, status: true, neighbourhoodId: true } },
                payments: { select: { id: true, provider: true, status: true, amountXaf: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: 200,
        });
    }

    async getOrderDetail(orderId: string) {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            include: {
                user: { select: { id: true, name: true, phone: true } },
                supplier: { select: { id: true, displayName: true, city: true, country: true } },
                variant: { include: { product: true } },
                pool: { include: { neighbourhood: true } },
                payments: true,
                purchaseOrder: { include: { events: { orderBy: { createdAt: 'desc' } } } },
            },
        });
        if (!order) throw new NotFoundException('Order not found');
        return order;
    }

    async updateOrderStatus(orderId: string, status: string) {
        return this.prisma.order.update({
            where: { id: orderId },
            data: { status: status as any },
            select: { id: true, status: true, updatedAt: true },
        });
    }

    // ── Analytics ──────────────────────────────────────────────────────────────

    async getAnalyticsOverview() {
        const now = new Date();
        const days: { label: string; start: Date; end: Date }[] = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date(now);
            d.setUTCDate(d.getUTCDate() - i);
            const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0));
            const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
            days.push({ label: start.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }), start, end });
        }
        const since = days[0].start;

        const [signupRows, orderRows, revenueRows, suppliersVerified, suppliersPending, topProductRows] = await Promise.all([
            this.prisma.$queryRaw<{ day: Date; count: bigint }[]>`SELECT DATE_TRUNC('day', "createdAt" AT TIME ZONE 'UTC') AS day, COUNT(*) AS count FROM "User" WHERE "createdAt" >= ${since} GROUP BY day ORDER BY day ASC`,
            this.prisma.$queryRaw<{ day: Date; count: bigint }[]>`SELECT DATE_TRUNC('day', "createdAt" AT TIME ZONE 'UTC') AS day, COUNT(*) AS count FROM "Order" WHERE "createdAt" >= ${since} GROUP BY day ORDER BY day ASC`,
            this.prisma.$queryRaw<{ day: Date; total: bigint }[]>`SELECT DATE_TRUNC('day', "createdAt" AT TIME ZONE 'UTC') AS day, COALESCE(SUM("amountXaf"), 0) AS total FROM "Order" WHERE "createdAt" >= ${since} AND "status" = 'PAID' GROUP BY day ORDER BY day ASC`,
            this.prisma.supplier.count({ where: { verificationStatus: VerificationStatus.VERIFIED } }),
            this.prisma.supplier.count({ where: { verificationStatus: VerificationStatus.PENDING } }),
            this.prisma.$queryRaw<{ title: string; unitsSold: bigint }[]>`SELECT p.title, COALESCE(SUM(o.qty), 0) AS "unitsSold" FROM "Order" o JOIN "ProductVariant" pv ON pv.id = o."variantId" JOIN "Product" p ON p.id = pv."productId" WHERE o."createdAt" >= ${since} GROUP BY p.id, p.title ORDER BY "unitsSold" DESC LIMIT 5`,
        ]);

        const toMap = (rows: any[]) => {
            const m = new Map<string, number>();
            for (const row of rows) {
                const key = new Date(row.day).toISOString().slice(0, 10);
                m.set(key, Number(row.count ?? row.total ?? 0));
            }
            return m;
        };

        const signupMap = toMap(signupRows);
        const orderMap = toMap(orderRows);
        const revenueMap = toMap(revenueRows);

        return {
            signupsPerDay: days.map(d => signupMap.get(d.start.toISOString().slice(0, 10)) ?? 0),
            ordersPerDay: days.map(d => orderMap.get(d.start.toISOString().slice(0, 10)) ?? 0),
            revenuePerDay: days.map(d => revenueMap.get(d.start.toISOString().slice(0, 10)) ?? 0),
            dayLabels: days.map(d => d.label),
            suppliersVerified,
            suppliersPending,
            topProducts: topProductRows.map(r => ({ name: r.title, unitsSold: Number(r.unitsSold) })),
        };
    }
}