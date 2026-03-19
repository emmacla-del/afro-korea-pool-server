import { Controller, Get, Patch, Body, UseGuards, Req } from '@nestjs/common';
import { NotBlockedGuard } from '../auth/not-blocked.guard'; // 👈 changed
import { UserService } from './user.service';
import { FastifyRequest } from 'fastify';

// Extend FastifyRequest to include the user property set by NotBlockedGuard
interface RequestWithUser extends FastifyRequest {
    user: {
        sub: string;
        phone: string;
        role: string;
    };
}

@Controller('user')
export class UserController {
    constructor(private readonly userService: UserService) { }

    // Public test endpoint – no guard
    @Get('ping')
    ping() {
        return 'pong';
    }

    @Get('profile')
    @UseGuards(NotBlockedGuard) // 👈 changed
    async getProfile(@Req() req: RequestWithUser) {
        const userId = req.user.sub;
        return this.userService.getProfile(userId);
    }

    @Patch('profile')
    @UseGuards(NotBlockedGuard) // 👈 changed
    async updateProfile(@Req() req: RequestWithUser, @Body('neighbourhoodId') neighbourhoodId?: string) {
        const userId = req.user.sub;
        return this.userService.updateProfile(userId, { neighbourhoodId });
    }
}