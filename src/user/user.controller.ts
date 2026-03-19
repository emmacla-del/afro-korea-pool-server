import { Controller, Get, Patch, Body, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UserService } from './user.service';
import { FastifyRequest } from 'fastify';

// Extend FastifyRequest to include the user property set by JwtAuthGuard
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
    @UseGuards(JwtAuthGuard)
    async getProfile(@Req() req: RequestWithUser) {
        const userId = req.user.sub;
        return this.userService.getProfile(userId);
    }

    @Patch('profile')
    @UseGuards(JwtAuthGuard)
    async updateProfile(@Req() req: RequestWithUser, @Body('neighbourhoodId') neighbourhoodId?: string) {
        const userId = req.user.sub;
        return this.userService.updateProfile(userId, { neighbourhoodId });
    }
}