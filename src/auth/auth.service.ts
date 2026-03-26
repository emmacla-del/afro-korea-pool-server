// src/auth/auth.service.ts
import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { UserRole, VerificationStatus, User } from '@prisma/client';
import { ReferralService } from '../referral/referral.service';
import { RedisService } from '../common/cache/redis.service';
import { RegisterDto, LoginDto } from './auth.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly SALT_ROUNDS = 12;
  private readonly TOKEN_EXPIRY = '7d';
  private readonly REFRESH_TOKEN_EXPIRY = '30d';

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly referralService: ReferralService,
    private readonly redisService: RedisService,
  ) { }

  // 👈 FIX: Added for local.strategy.ts
  async validateUser(phone: string, pass: string): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { phone },
      include: { supplier: true, neighbourhood: true }
    });

    if (user && await bcrypt.compare(pass, user.password)) {
      const { password, ...result } = user;
      return result;
    }
    return null;
  }

  async register(registerDto: RegisterDto) {
    const { phone, password, role, name, referralCode, supplierData } = registerDto;

    const existingUser = await this.prisma.user.findUnique({ where: { phone } });
    if (existingUser) {
      throw new ConflictException({ message: 'Phone number already registered', code: 'USER_EXISTS' });
    }

    const hashedPassword = await bcrypt.hash(password, this.SALT_ROUNDS);

    const user = await this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          phone,
          password: hashedPassword,
          role: role || UserRole.CUSTOMER,
          name: name || null,
          totalPoints: 0,
          checkinStreak: 0,
        },
      });

      if (role === UserRole.SUPPLIER && supplierData) {
        await tx.supplier.create({
          data: {
            ownerUserId: newUser.id,
            displayName: supplierData.displayName,
            country: supplierData.country,
            city: supplierData.city || null,
            verificationStatus: VerificationStatus.UNVERIFIED,
          },
        });
      }
      return newUser;
    });

    if (referralCode) {
      try { await this.referralService.applyReferral(user.id, referralCode); }
      catch (e: any) { this.logger.warn(`Referral failed: ${e.message}`); }
    }

    return this._buildAuthResponse(user);
  }

  async login(user: any) { // Called by AuthController after LocalAuthGuard
    return this._buildAuthResponse(user);
  }

  async refreshToken(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken, { secret: process.env.JWT_REFRESH_SECRET });
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user) throw new UnauthorizedException();

      return {
        access_token: this.jwtService.sign({ sub: user.id, phone: user.phone, role: user.role }),
        refresh_token: refreshToken, // Or generate a new one
      };
    } catch (error: any) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { supplier: true, neighbourhood: true }
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  private _buildAuthResponse(user: any) {
    const payload = { sub: user.id, phone: user.phone, role: user.role };
    return {
      access_token: this.jwtService.sign(payload),
      refresh_token: this.jwtService.sign({ sub: user.id }, { secret: process.env.JWT_REFRESH_SECRET, expiresIn: this.REFRESH_TOKEN_EXPIRY }),
      user: {
        id: user.id,
        phone: user.phone,
        role: user.role,
        name: user.name,
        isBlocked: user.isBlocked,
        totalPoints: user.totalPoints || 0,
      },
    };
  }
}