import { Controller, Post, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SupplierService } from './supplier.service';
import { FastifyRequest } from 'fastify';
import { requireUserId } from '../common/auth';

@Controller('supplier')
@UseGuards(JwtAuthGuard)
export class SupplierController {
    constructor(private readonly supplierService: SupplierService) { }

    @Post('request-verification')
    async requestVerification(@Req() req: FastifyRequest) {
        const userId = requireUserId(req);
        return this.supplierService.requestVerification(userId);
    }
}