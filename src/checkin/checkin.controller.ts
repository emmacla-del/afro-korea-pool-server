import { Controller, Post, Get, UseGuards, Req, BadRequestException } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { NotBlockedGuard } from '../auth/not-blocked.guard'; // 👈 changed
import { requireUserId } from '../common/auth';
import { CheckinService } from './checkin.service';

@Controller('checkin')
@UseGuards(NotBlockedGuard) // 👈 now checks both JWT and block status
export class CheckinController {
    constructor(private readonly checkinService: CheckinService) { }

    @Post()
    async checkIn(@Req() req: FastifyRequest) {
        const userId = requireUserId(req);
        try {
            return await this.checkinService.checkIn(userId);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Check-in failed';
            throw new BadRequestException(message);
        }
    }

    @Get('streak')
    async getStreak(@Req() req: FastifyRequest) {
        const userId = requireUserId(req);
        return this.checkinService.getStreak(userId);
    }
}