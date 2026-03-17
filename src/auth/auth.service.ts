import { Injectable, UnauthorizedException, BadRequestException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { UserRole } from '@prisma/client';
import { ReferralService } from '../referral/referral.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private referralService: ReferralService,
  ) { }

  async register(
    phone: string,
    password: string,
    role: UserRole,
    supplierData?: {
      displayName: string;
      country: string;
      city?: string;
      businessRegNumber?: string;
    },
    name?: string,
    referralCode?: string,
  ) {
    const hashedPassword = await bcrypt.hash(password, 10);

    let user;
    try {
      user = await this.prisma.user.create({
        data: {
          phone,
          password: hashedPassword,
          role,
          name: name || null,
        },
      });
    } catch (error) {
      const prismaError = error as any;
      if (prismaError.code === 'P2002') {
        throw new ConflictException('Phone already registered');
      }
      throw error;
    }

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
        },
      });
    }

    // Apply referral if code provided
    if (referralCode) {
      try {
        await this.referralService.applyReferral(user.id, referralCode);
      } catch (error) {
        // Log error but do not fail registration – properly handle unknown type
        if (error instanceof Error) {
          console.error('Failed to apply referral:', error.message);
        } else {
          console.error('Failed to apply referral:', String(error));
        }
      }
    }

    return this.login(user);
  }

  async login(user: any) {
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const payload = { sub: user.id, phone: user.phone, role: user.role };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        phone: user.phone,
        role: user.role,
        name: user.name,
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