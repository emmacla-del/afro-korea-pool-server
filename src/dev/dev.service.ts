import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DevService {
  constructor(private prisma: PrismaService) {}

  async createUser(input: { phone?: string; password?: string; role?: 'CUSTOMER' | 'SUPPLIER' | 'ADMIN' }) {
    const id = randomUUID();
    const role = (input.role ?? 'CUSTOMER').toUpperCase() as 'CUSTOMER' | 'SUPPLIER' | 'ADMIN';
    if (role !== 'CUSTOMER' && role !== 'SUPPLIER' && role !== 'ADMIN') {
      throw new BadRequestException('Invalid role');
    }
    const passwordHash = await bcrypt.hash(input.password ?? 'dev-password', 10);

    try {
      const created = await this.prisma.user.create({
        data: {
          id,
          phone: input.phone ?? null,
          password: passwordHash,
          role,
        },
      });
      return created;
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw new BadRequestException('Phone must be unique');
      }
      throw err;
    }
  }

  async createSupplier(input: { ownerUserId: string; displayName: string }) {
    const user = await this.prisma.user.findUnique({
      where: { id: input.ownerUserId },
    });
    if (!user) throw new BadRequestException('Owner user not found');

    await this.prisma.user.update({
      where: { id: input.ownerUserId },
      data: { role: 'SUPPLIER' },
    });

    const supplierId = randomUUID();
    const supplier = await this.prisma.supplier.create({
      data: {
        id: supplierId,
        ownerUserId: input.ownerUserId,
        displayName: input.displayName,
      },
    });
    return supplier;
  }

  async seedSupplier(input: { displayName: string; phone?: string; password?: string }) {
    const passwordHash = await bcrypt.hash(input.password ?? 'dev-password', 10);
    const userId = randomUUID();
    const user = await this.prisma.user.create({
      data: {
        id: userId,
        phone: input.phone ?? null,
        password: passwordHash,
        role: 'SUPPLIER',
      },
    });

    const supplierId = randomUUID();
    const supplier = await this.prisma.supplier.create({
      data: {
        id: supplierId,
        ownerUserId: userId,
        displayName: input.displayName,
      },
    });

    return { supplierUserId: userId, supplierId };
  }
}
