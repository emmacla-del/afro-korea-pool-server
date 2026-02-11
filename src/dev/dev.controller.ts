import { Body, Controller, Post, Req } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireDevAdminSecret } from '../common/auth';
import { DevService } from './dev.service';

const createUserSchema = z.object({
  phone: z.string().min(3).max(50).optional(),
  role: z.enum(['CUSTOMER', 'SUPPLIER', 'ADMIN']).optional(),
});

const createSupplierSchema = z.object({
  ownerUserId: z.string().uuid(),
  displayName: z.string().min(1).max(200),
});

const seedSupplierSchema = z.object({
  displayName: z.string().min(1).max(200).default('Demo Supplier'),
  phone: z.string().min(3).max(50).optional(),
});

@Controller()
export class DevController {
  constructor(private readonly devService: DevService) {}

  @Post('/dev/users')
  async createUser(@Req() req: FastifyRequest, @Body() body: unknown) {
    requireDevAdminSecret(req);
    const parsed = createUserSchema.parse(body);
    return this.devService.createUser(parsed);
  }

  @Post('/dev/suppliers')
  async createSupplier(@Req() req: FastifyRequest, @Body() body: unknown) {
    requireDevAdminSecret(req);
    const parsed = createSupplierSchema.parse(body);
    return this.devService.createSupplier(parsed);
  }

  @Post('/dev/seed/supplier')
  async seedSupplier(@Req() req: FastifyRequest, @Body() body: unknown) {
    requireDevAdminSecret(req);
    const parsed = seedSupplierSchema.parse(body);
    return this.devService.seedSupplier(parsed);
  }
}

