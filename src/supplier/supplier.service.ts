import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PurchaseOrderStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SupplierService {
  constructor(private readonly prisma: PrismaService) { }

  // ── Internal helper ────────────────────────────────────────────────────────

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

  // ── Verification ───────────────────────────────────────────────────────────

  async requestVerification(userId: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { ownerUserId: userId },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');

    if (supplier.verificationStatus === 'VERIFIED') {
      throw new BadRequestException('Your account is already verified');
    }
    if (supplier.verificationStatus === 'PENDING') {
      return { message: 'Verification request already pending' };
    }

    await this.prisma.supplier.update({
      where: { id: supplier.id },
      data: { verificationStatus: 'PENDING' },
    });

    return { message: 'Verification request submitted' };
  }

  // ── Products ───────────────────────────────────────────────────────────────

  async getProducts(userId: string) {
    const supplier = await this.getSupplierForUser(userId);

    return this.prisma.product.findMany({
      where: { supplierId: supplier.id },
      include: {
        variants: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
        },
        images: {
          orderBy: { order: 'asc' },
          take: 1,
        },
        category_: {
          select: { id: true, name: true, emoji: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getProductSummary(userId: string) {
    const supplier = await this.getSupplierForUser(userId);

    const [total, active, inactive] = await this.prisma.$transaction([
      this.prisma.product.count({
        where: { supplierId: supplier.id },
      }),
      this.prisma.product.count({
        where: { supplierId: supplier.id, isActive: true },
      }),
      this.prisma.product.count({
        where: { supplierId: supplier.id, isActive: false },
      }),
    ]);

    return { total, active, inactive };
  }

  async createProduct(
    userId: string,
    data: {
      title: string;
      description?: string;
      categoryId?: string;
      unitPriceXaf: number;
      thresholdQty: number;
      leadTimeDays?: number;
    },
  ) {
    const supplier = await this.getSupplierForUser(userId);

    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          supplierId: supplier.id,
          title: data.title,
          description: data.description,
          categoryId: data.categoryId,
        },
      });

      const sku = `SKU-${supplier.id.substring(0, 6).toUpperCase()}-${Date.now()}`;

      await tx.productVariant.create({
        data: {
          productId: product.id,
          sku,
          unitPriceXaf: Math.round(data.unitPriceXaf),
          thresholdQty: data.thresholdQty,
          leadTimeDays: data.leadTimeDays ?? 14,
        },
      });

      return tx.product.findUnique({
        where: { id: product.id },
        include: {
          variants: true,
          category_: { select: { id: true, name: true, emoji: true } },
        },
      });
    });
  }

  async updateProduct(
    userId: string,
    productId: string,
    data: {
      title?: string;
      description?: string;
      categoryId?: string;
      isActive?: boolean;
      unitPriceXaf?: number;
      thresholdQty?: number;
    },
  ) {
    const supplier = await this.getSupplierForUser(userId);

    const product = await this.prisma.product.findFirst({
      where: { id: productId, supplierId: supplier.id },
    });
    if (!product) throw new NotFoundException('Product not found');

    const { unitPriceXaf, thresholdQty, ...productData } = data;

    await this.prisma.product.update({
      where: { id: productId },
      data: productData,
    });

    // Update the latest active variant's price/stock if provided
    if (unitPriceXaf !== undefined || thresholdQty !== undefined) {
      const variant = await this.prisma.productVariant.findFirst({
        where: { productId, isActive: true },
        orderBy: { createdAt: 'desc' },
      });
      if (variant) {
        await this.prisma.productVariant.update({
          where: { id: variant.id },
          data: {
            ...(unitPriceXaf !== undefined
              ? { unitPriceXaf: Math.round(unitPriceXaf) }
              : {}),
            ...(thresholdQty !== undefined ? { thresholdQty } : {}),
          },
        });
      }
    }

    return this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        variants: { where: { isActive: true }, orderBy: { createdAt: 'desc' } },
        category_: { select: { id: true, name: true, emoji: true } },
      },
    });
  }

  async deleteProduct(userId: string, productId: string) {
    const supplier = await this.getSupplierForUser(userId);

    const product = await this.prisma.product.findFirst({
      where: { id: productId, supplierId: supplier.id },
    });
    if (!product) throw new NotFoundException('Product not found');

    // Soft delete — just deactivate
    await this.prisma.product.update({
      where: { id: productId },
      data: { isActive: false },
    });

    return { success: true, productId };
  }

  // ── Purchase Orders ────────────────────────────────────────────────────────

  async listPurchaseOrders(userId: string) {
    const supplier = await this.getSupplierForUser(userId);

    return this.prisma.purchaseOrder.findMany({
      where: { supplierId: supplier.id },
      include: {
        items: {
          include: {
            purchaseOrder: false,
          },
        },
        events: { orderBy: { createdAt: 'desc' } },
        pool: {
          select: {
            id: true,
            status: true,
            committedQty: true,
            paidQty: true,
            neighbourhood: { select: { id: true, name: true } },
          },
        },
        directOrder: {
          select: {
            id: true,
            qty: true,
            amountXaf: true,
            user: { select: { id: true, name: true, phone: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async getPurchaseOrdersSummary(userId: string) {
    const supplier = await this.getSupplierForUser(userId);

    const [pending, confirmed, shipped, delivered] =
      await this.prisma.$transaction([
        this.prisma.purchaseOrder.count({
          where: {
            supplierId: supplier.id,
            status: PurchaseOrderStatus.PENDING_SUPPLIER_CONFIRM,
          },
        }),
        this.prisma.purchaseOrder.count({
          where: {
            supplierId: supplier.id,
            status: PurchaseOrderStatus.CONFIRMED,
          },
        }),
        this.prisma.purchaseOrder.count({
          where: {
            supplierId: supplier.id,
            status: PurchaseOrderStatus.SHIPPED,
          },
        }),
        this.prisma.purchaseOrder.count({
          where: {
            supplierId: supplier.id,
            status: PurchaseOrderStatus.DELIVERED,
          },
        }),
      ]);

    return { pending, confirmed, shipped, delivered };
  }

  async confirmPurchaseOrder(userId: string, purchaseOrderId: string) {
    const supplier = await this.getSupplierForUser(userId);

    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id: purchaseOrderId, supplierId: supplier.id },
    });
    if (!po) throw new NotFoundException('Purchase order not found');

    if (po.status !== PurchaseOrderStatus.PENDING_SUPPLIER_CONFIRM) {
      throw new BadRequestException(
        `Cannot confirm a purchase order with status: ${po.status}`,
      );
    }

    return this.prisma.purchaseOrder.update({
      where: { id: po.id },
      data: {
        status: PurchaseOrderStatus.CONFIRMED,
        events: { create: [{ status: 'CONFIRMED', note: 'Confirmed by supplier' }] },
      },
      include: { events: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
  }

  async markShipped(
    userId: string,
    purchaseOrderId: string,
    trackingCode?: string,
    note?: string,
  ) {
    const supplier = await this.getSupplierForUser(userId);

    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id: purchaseOrderId, supplierId: supplier.id },
    });
    if (!po) throw new NotFoundException('Purchase order not found');

    if (po.status !== PurchaseOrderStatus.CONFIRMED) {
      throw new BadRequestException(
        `Cannot mark shipped: order status is ${po.status}. Must be CONFIRMED first.`,
      );
    }

    return this.prisma.purchaseOrder.update({
      where: { id: po.id },
      data: {
        status: PurchaseOrderStatus.SHIPPED,
        events: {
          create: [
            {
              status: 'SHIPPED',
              trackingCode,
              note: note ?? 'Marked as shipped by supplier',
            },
          ],
        },
      },
      include: { events: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
  }

  async markDelivered(userId: string, purchaseOrderId: string, note?: string) {
    const supplier = await this.getSupplierForUser(userId);

    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id: purchaseOrderId, supplierId: supplier.id },
    });
    if (!po) throw new NotFoundException('Purchase order not found');

    if (po.status !== PurchaseOrderStatus.SHIPPED) {
      throw new BadRequestException(
        `Cannot mark delivered: order status is ${po.status}. Must be SHIPPED first.`,
      );
    }

    return this.prisma.purchaseOrder.update({
      where: { id: po.id },
      data: {
        status: PurchaseOrderStatus.DELIVERED,
        events: {
          create: [
            {
              status: 'DELIVERED',
              note: note ?? 'Marked as delivered by supplier',
            },
          ],
        },
      },
      include: { events: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  async getOrders(userId: string, status?: string) {
    const supplier = await this.getSupplierForUser(userId);

    return this.prisma.order.findMany({
      where: {
        supplierId: supplier.id,
        ...(status ? { status: status as any } : {}),
      },
      include: {
        user: { select: { id: true, name: true, phone: true } },
        variant: { include: { product: { select: { id: true, title: true } } } },
        pool: { select: { id: true, status: true } },
        payments: { select: { id: true, provider: true, status: true, amountXaf: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  // ── Catalog imports (stub) ─────────────────────────────────────────────────
  // Implement when you add bulk CSV/Excel import support.

  async getLatestCatalogImport(userId: string) {
    await this.getSupplierForUser(userId); // auth check
    return { status: 'NOT_IMPLEMENTED', message: 'Catalog import coming soon' };
  }
}