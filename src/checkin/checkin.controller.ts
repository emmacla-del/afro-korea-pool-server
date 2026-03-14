import { Controller, Post, Get, UseGuards, Req, BadRequestException } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { requireUserId } from '../common/auth';
import { CheckinService } from './checkin.service';

@Controller('checkin')
@UseGuards(JwtAuthGuard)
export class CheckinController {
    constructor(private readonly checkinService: CheckinService) { }

    @Post()
    async checkIn(@Req() req: FastifyRequest) {
        const userId = requireUserId(req);
        try {
            return await this.checkinService.checkIn(userId);
        } catch (error) {
            throw new BadRequestException(error.message);
        }
    }

    @Get('streak')
    async getStreak(@Req() req: FastifyRequest) {
        const userId = requireUserId(req);
        return this.checkinService.getStreak(userId);
    }
}