import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

interface AuthUserDto {
  id: string;
  phone: string | null;
  role: UserRole;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(
    phone: string,
    password: string,
    role: UserRole,
  ): Promise<{ access_token: string; user: AuthUserDto }> {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      throw new BadRequestException('Phone is required');
    }
    if (password.trim().length < 6) {
      throw new BadRequestException('Password must be at least 6 characters');
    }

    const existing = await this.prisma.user.findUnique({
      where: { phone: normalizedPhone },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('Phone already registered');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const created = await this.prisma.user.create({
      data: {
        phone: normalizedPhone,
        password: passwordHash,
        role,
      },
    });

    if (role === UserRole.SUPPLIER) {
      await this.prisma.supplier.create({
        data: {
          ownerUserId: created.id,
          displayName: normalizedPhone,
        },
      });
    }

    return this.login(created);
  }

  async validateUser(phone: string, password: string): Promise<User> {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone || !password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const user = await this.prisma.user.findUnique({
      where: { phone: normalizedPhone },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return user;
  }

  async login(user: Pick<User, 'id' | 'phone' | 'role'>): Promise<{
    access_token: string;
    user: AuthUserDto;
  }> {
    const payload = {
      sub: user.id,
      phone: user.phone,
      role: user.role,
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      expiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
    });

    return {
      access_token: accessToken,
      user: {
        id: user.id,
        phone: user.phone,
        role: user.role,
      },
    };
  }
}

function normalizePhone(phone: string): string {
  return phone.trim();
}
