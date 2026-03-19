import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { UserRole, VerificationStatus } from '@prisma/client';
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
    if (role === UserRole.SUPPLIER && !supplierData) {
      throw new BadRequestException('Supplier data required');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await this.prisma.$transaction(async (prisma) => {
      let user;
      try {
        user = await prisma.user.create({
          data: {
            phone,
            password: hashedPassword,
            role,
            name: name ?? null,
          },
        });
      } catch (error: any) {
        if (error.code === 'P2002') {
          throw new ConflictException('Phone already registered');
        }
        throw error;
      }

      if (role === UserRole.SUPPLIER && supplierData) {
        await prisma.supplier.create({
          data: {
            ownerUserId: user.id,
            displayName: supplierData.displayName,
            country: supplierData.country,
            city: supplierData.city ?? null,
            businessRegNumber: supplierData.businessRegNumber ?? null,
            verificationStatus: VerificationStatus.UNVERIFIED,
          },
        });
      }

      return user;
    });

    if (referralCode) {
      try {
        await this.referralService.applyReferral(user.id, referralCode);
      } catch (error) {
        console.error(
          'Failed to apply referral:',
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    return this._buildAuthResponse(user);
  }

  async login(user: any) {
    if (!user) throw new UnauthorizedException('Invalid credentials');
    return this._buildAuthResponse(user);
  }

  async validateUser(phone: string, password: string): Promise<any> {
    const user = await this.prisma.user.findUnique({ where: { phone } });
    if (user && (await bcrypt.compare(password, user.password))) {
      const { password: _, ...result } = user;
      return result;
    }
    return null;
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private _buildAuthResponse(user: any) {
    const payload = { sub: user.id, phone: user.phone, role: user.role };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        phone: user.phone,
        role: user.role,
        name: user.name,
        isBlocked: user.isBlocked, // 👈 added
      },
    };
  }
}