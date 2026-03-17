import { Body, Controller, Post } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { z } from 'zod';
import { AuthService } from './auth.service';

const registerSchema = z.object({
  phone: z.string().trim().min(3).max(50),
  password: z.string().min(6).max(200),
  role: z.enum(['CUSTOMER', 'SUPPLIER']).default('CUSTOMER'),
  name: z.string().optional(),               // 👈 NEW
  referralCode: z.string().optional(),       // 👈 NEW
});

const loginSchema = z.object({
  phone: z.string().trim().min(3).max(50),
  password: z.string().min(6).max(200),
});

@Controller('/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  @Post('/register')
  async register(@Body() body: unknown) {
    const parsed = registerSchema.parse(body);
    const role =
      parsed.role === 'SUPPLIER' ? UserRole.SUPPLIER : UserRole.CUSTOMER;

    // Note: supplierData is not sent via this schema – you may need to extend it later
    return this.authService.register(
      parsed.phone,
      parsed.password,
      role,
      undefined, // supplierData (if needed)
      parsed.name,
      parsed.referralCode,
    );
  }

  @Post('/login')
  async login(@Body() body: unknown) {
    const parsed = loginSchema.parse(body);
    const user = await this.authService.validateUser(
      parsed.phone,
      parsed.password,
    );
    return this.authService.login(user);
  }
}