import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { UserRole } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) { }

  async register(
    phone: string,
    password: string,
    role: UserRole,
    supplierData?: {
      displayName: string;
      country: string;          // required for suppliers
      city?: string;
      businessRegNumber?: string;
    },
  ) {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await this.prisma.user.create({
      data: { phone, password: hashedPassword, role },
    });

    if (role === 'SUPPLIER') {
      if (!supplierData) {
        throw new BadRequestException('Supplier data required');
      }
      await this.prisma.supplier.create({
        data: {
          ownerUserId: user.id,
          displayName: supplierData.displayName,
          country: supplierData.country,
          city: supplierData.city,
          businessRegNumber: supplierData.businessRegNumber,
          // verificationStatus defaults to 'PENDING'
        },
      });
    }

    return this.login(user);
  }

  async login(user: any) {
    const payload = { sub: user.id, phone: user.phone, role: user.role };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        phone: user.phone,
        role: user.role,
      },
    };
  }

  async validateUser(phone: string, password: string): Promise<any> {
    const user = await this.prisma.user.findUnique({ where: { phone } });
    if (user && (await bcrypt.compare(password, user.password))) {
      const { password, ...result } = user;
      return result;
    }
    return null;
  }
}