// src/auth/auth.service.ts
import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../common/cache/cache.service';
import { RegisterDto, LoginDto } from './auth.dto';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly cacheService: CacheService,
  ) { }

  /**
   * 1. VALIDATE USER (For Local Strategy)
   */
  async validateUser(phone: string, pass: string): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { phone },
    });

    if (user && (await bcrypt.compare(pass, user.password))) {
      // Remove sensitive data before returning
      const { password, ...result } = user;
      return result;
    }
    return null;
  }

  /**
   * 2. LOGIN (Generates the JWT)
   */
  async login(user: any) {
    const payload = {
      phone: user.phone,
      sub: user.id,
      role: user.role,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        role: user.role,
      },
    };
  }

  /**
   * 3. REGISTER (Creates a new User, and if SUPPLIER, also creates a Supplier record)
   */
  async register(dto: RegisterDto) {
    // 1. Restrict roles – only CUSTOMER or SUPPLIER via public registration
    const allowedRoles = ['CUSTOMER', 'SUPPLIER'];
    let requestedRole = dto.role || 'CUSTOMER';
    if (!allowedRoles.includes(requestedRole)) {
      throw new BadRequestException('Invalid role. Allowed roles: CUSTOMER, SUPPLIER');
    }
    const userRole = requestedRole as UserRole;

    // 2. Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
    });
    if (existingUser) {
      throw new ConflictException('Phone number already registered');
    }

    try {
      const hashedPassword = await bcrypt.hash(dto.password, 10);

      // Use a transaction to create both User and Supplier (if role is SUPPLIER)
      const result = await this.prisma.$transaction(async (prisma) => {
        // Create the user
        const user = await prisma.user.create({
          data: {
            name: dto.name,
            phone: dto.phone,
            password: hashedPassword,
            role: userRole,
            totalPoints: 0,
          },
        });

        // If role is SUPPLIER, create the corresponding Supplier record
        if (user.role === UserRole.SUPPLIER) {
          // Ensure displayName is always a string
          const displayName =
            dto.supplierData?.displayName ?? dto.name ?? dto.phone ?? 'Supplier';
          const country = dto.supplierData?.country ?? 'CM';

          await prisma.supplier.create({
            data: {
              ownerUserId: user.id,
              displayName,
              country,
              businessRegNumber: dto.supplierData?.businessRegNumber ?? null,
              verificationStatus: 'UNVERIFIED',
              // neighbourhoodId can be added later
            },
          });
        }

        return user;
      });

      const { password, ...userWithoutPassword } = result;
      return userWithoutPassword;
    } catch (error) {
      console.error('Registration error:', error);
      throw new InternalServerErrorException('Error creating account');
    }
  }

  /**
   * 4. LOGOUT
   */
  async logout(userId: string) {
    try {
      // Logic to invalidate session if using your CacheService
      // await this.cacheService.set(`logout_${userId}`, true, 3600);

      return {
        success: true,
        message: 'Logged out successfully',
      };
    } catch (error) {
      throw new InternalServerErrorException('Logout process failed');
    }
  }

  /**
   * 5. GET PROFILE (Useful for Flutter app sync)
   */
  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) throw new UnauthorizedException();

    const { password, ...result } = user;
    return result;
  }
}