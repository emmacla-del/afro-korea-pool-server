import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminGuard extends JwtAuthGuard implements CanActivate {
    constructor(private prisma: PrismaService) {
        super();
    }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        // First, check if the user is authenticated via JwtAuthGuard
        const isAuthenticated = await super.canActivate(context);
        if (!isAuthenticated) {
            return false;
        }

        const request = context.switchToHttp().getRequest();
        const userId = request.user?.sub;

        if (!userId) {
            throw new ForbiddenException('User not found');
        }

        // Fetch user from database to check role
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { role: true },
        });

        if (!user || user.role !== 'ADMIN') {
            throw new ForbiddenException('Admin access required');
        }

        return true;
    }
}