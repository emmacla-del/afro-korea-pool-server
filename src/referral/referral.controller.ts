import { Controller, Get, Post, Param, UseGuards, Req, Body, BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { requireUserId } from '../common/auth';
import { ReferralService } from './referral.service';
import { FastifyRequest } from 'fastify';

@Controller('referral')
export class ReferralController {
    constructor(private readonly referralService: ReferralService) { }

    @Post('generate')
    @UseGuards(JwtAuthGuard)
    async generateCode(@Req() req: FastifyRequest) {
        const userId = requireUserId(req);
        const code = await this.referralService.generateCode(userId);
        return { referralCode: code };
    }

    @Get('info/:code')
    async getReferrerInfo(@Param('code') code: string) {
        const user = await this.referralService.getReferrerByCode(code);
        if (!user) throw new BadRequestException('Invalid code');
        return user;
    }

    @Post('apply')
    async applyReferral(@Body() body: { newUserId: string; code: string }) {
        return this.referralService.applyReferral(body.newUserId, body.code);
    }

    @Get('stats')
    @UseGuards(JwtAuthGuard)
    async getStats(@Req() req: FastifyRequest) {
        const userId = requireUserId(req);
        return this.referralService.getReferralStats(userId);
    }
}