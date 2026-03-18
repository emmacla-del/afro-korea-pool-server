import { Body, Controller, Post, BadRequestException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { z } from 'zod';
import { AuthService } from './auth.service';

const supplierDataSchema = z.object({
  displayName: z.string().min(1).max(200),
  country: z.string().min(1).max(100),
  city: z.string().optional(),
  businessRegNumber: z.string().optional(),
});

const registerSchema = z.object({
  phone: z.string().trim().min(3).max(50),
  password: z.string().min(6).max(200),
  role: z.enum(['CUSTOMER', 'SUPPLIER']).default('CUSTOMER'),
  name: z.string().optional(),
  referralCode: z.string().optional(),
  supplierData: supplierDataSchema.optional(),
}).refine(
  (data) => {
    if (data.role === 'SUPPLIER') {
      return data.supplierData != null;
    }
    return true;
  },
  {
    message: 'Supplier data is required when role is SUPPLIER',
    path: ['supplierData'],
  }
);

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
    const role = parsed.role === 'SUPPLIER' ? UserRole.SUPPLIER : UserRole.CUSTOMER;
    return this.authService.register(
      parsed.phone,
      parsed.password,
      role,
      parsed.supplierData,
      parsed.name,
      parsed.referralCode,
    );
  }

  @Post('/login')
  async login(@Body() body: unknown) {
    const parsed = loginSchema.parse(body);
    const user = await this.authService.validateUser(parsed.phone, parsed.password);
    return this.authService.login(user);
  }
}