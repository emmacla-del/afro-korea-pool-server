import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  InternalServerErrorException
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../common/cache/cache.service';
import { RegisterDto, LoginDto } from './auth.dto';
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
      role: user.role
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
   * 3. REGISTER (Creates a new User)
   */
  async register(dto: RegisterDto) {
    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
    });

    if (existingUser) {
      throw new ConflictException('Phone number already registered');
    }

    try {
      // Hash the password for security
      const hashedPassword = await bcrypt.hash(dto.password, 10);

      const newUser = await this.prisma.user.create({
        data: {
          name: dto.name,
          phone: dto.phone,
          password: hashedPassword,
          role: dto.role || 'CUSTOMER',
          totalPoints: 0, // Matches your updated Prisma schema
        },
      });

      const { password, ...result } = newUser;
      return result;
    } catch (error) {
      throw new InternalServerErrorException('Error creating account');
    }
  }

  /**
   * 4. LOGOUT (Fixed TS2339 Error)
   */
  async logout(userId: string) {
    try {
      // Logic to invalidate session if using your CacheService
      // await this.cacheService.set(`logout_${userId}`, true, 3600);

      return {
        success: true,
        message: 'Logged out successfully'
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