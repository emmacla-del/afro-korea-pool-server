import { ForbiddenException, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PurchaseOrderStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SupplierService {
  constructor(private readonly prisma: PrismaService) { }

  async getSupplierForUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { supplier: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== UserRole.SUPPLIER || !user.supplier) {
      throw new ForbiddenException('Not a supplier');
    }
    return user.supplier;
  }

  async listPurchaseOrders(userId: string) {
    const supplier = await this.getSupplierForUser(userId);
    return this.prisma.purchaseOrder.findMany({
      where: { supplierId: supplier.id },
      include: {
        items: true,
        events: { orderBy: { createdAt: 'desc' } },
        pool: true,
        directOrder: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async getPurchaseOrdersSummary(userId: string) {
    const supplier = await this.getSupplierForUser(userId);

    const [pending, shipped] = await this.prisma.$transaction([
      this.prisma.purchaseOrder.count({
        where: {
          supplierId: supplier.id,
          status: {
            in: [
              PurchaseOrderStatus.PENDING_SUPPLIER_CONFIRM,
              PurchaseOrderStatus.CONFIRMED,
            ],
          },
        },
      }),
      this.prisma.purchaseOrder.count({
        where: {
          supplierId: supplier.id,
          status: PurchaseOrderStatus.SHIPPED,
        },
      }),
    ]);

    return { pending, shipped };
  }

  async confirmPurchaseOrder(userId: string, purchaseOrderId: string) {
    const supplier = await this.getSupplierForUser(userId);
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id: purchaseOrderId, supplierId: supplier.id },
    });
    if (!po) throw new NotFoundException('Purchase order not found');

    const updated = await this.prisma.purchaseOrder.update({
      where: { id: po.id },
      data: {
        status: PurchaseOrderStatus.CONFIRMED,
        events: { create: [{ status: 'CONFIRMED' }] },
      },
    });
    return updated;
  }

  async markShipped(userId: string, purchaseOrderId: string, trackingCode?: string) {
    const supplier = await this.getSupplierForUser(userId);
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id: purchaseOrderId, supplierId: supplier.id },
    });
    if (!po) throw new NotFoundException('Purchase order not found');

    return this.prisma.purchaseOrder.update({
      where: { id: po.id },
      data: {
        status: PurchaseOrderStatus.SHIPPED,
        events: { create: [{ status: 'SHIPPED', trackingCode }] },
      },
    });
  }

  // 👇 NEW METHOD for verification requests
  async requestVerification(userId: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { ownerUserId: userId },
    });
    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }

    if (supplier.verificationStatus === 'VERIFIED') {
      throw new BadRequestException('Your account is already verified');
    }

    if (supplier.verificationStatus === 'PENDING') {
      return { message: 'Verification request already pending' };
    }

    // If status is REJECTED or any other, update to PENDING
    await this.prisma.supplier.update({
      where: { id: supplier.id },
      data: { verificationStatus: 'PENDING' },
    });

    return { message: 'Verification request submitted' };
  }
}