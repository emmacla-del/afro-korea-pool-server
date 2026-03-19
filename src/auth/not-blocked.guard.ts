import {
    Injectable,
    ExecutionContext,
    ForbiddenException,
} from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotBlockedGuard extends JwtAuthGuard {
    constructor(private readonly prisma: PrismaService) {
        super();
    }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        // 1. Verify JWT first — reuses your existing JwtAuthGuard logic
        const isAuthenticated = await super.canActivate(context);
        if (!isAuthenticated) return false;

        const request = context.switchToHttp().getRequest();
        const userId = request.user?.sub;
        if (!userId) throw new ForbiddenException('User not found');

        // 2. Check isBlocked — single lightweight query, select only what we need
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { isBlocked: true },
        });

        if (user?.isBlocked) {
            throw new ForbiddenException(
                'Your account has been blocked. Please contact support.',
            );
        }

        return true;
    }
}