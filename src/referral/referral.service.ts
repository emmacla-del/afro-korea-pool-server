import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { randomBytes } from 'crypto';

@Injectable()
export class ReferralService {
    constructor(private prisma: PrismaService) { }

    async generateCode(userId: string): Promise<string> {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new NotFoundException('User not found');

        if (user.referralCode) return user.referralCode;

        let code: string;
        let exists: any;
        do {
            code = randomBytes(4).toString('hex').toUpperCase();
            exists = await this.prisma.user.findUnique({ where: { referralCode: code } });
        } while (exists);

        await this.prisma.user.update({
            where: { id: userId },
            data: { referralCode: code },
        });

        return code;
    }

    // ✅ FIXED: Return type now matches Prisma's actual output (name can be null)
    async getReferrerByCode(code: string): Promise<{ id: string; name: string | null } | null> {
        const user = await this.prisma.user.findUnique({
            where: { referralCode: code },
            select: { id: true, name: true },
        });
        return user; // Prisma returns { id, name: string | null }
    }

    async applyReferral(newUserId: string, referrerCode: string) {
        const referrer = await this.prisma.user.findUnique({
            where: { referralCode: referrerCode },
        });
        if (!referrer) throw new NotFoundException('Invalid referral code');

        if (referrer.id === newUserId) {
            throw new ConflictException('Cannot refer yourself');
        }

        await this.prisma.user.update({
            where: { id: newUserId },
            data: { referrerId: referrer.id },
        });

        await this.prisma.rewardTransaction.create({
            data: {
                userId: referrer.id,
                amount: 100,
                description: `Referred a new user`,
                referenceId: newUserId,
            },
        });

        await this.prisma.rewardTransaction.create({
            data: {
                userId: newUserId,
                amount: 50,
                description: `Welcome bonus for joining via referral`,
            },
        });

        await this.prisma.user.update({
            where: { id: referrer.id },
            data: { rewardBalance: { increment: 100 } },
        });
        await this.prisma.user.update({
            where: { id: newUserId },
            data: { rewardBalance: { increment: 50 } },
        });

        return { success: true };
    }

    async getReferralStats(userId: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: {
                referrals: { select: { id: true, name: true, createdAt: true } },
                rewardTransactions: { orderBy: { createdAt: 'desc' } },
            },
        });
        if (!user) throw new NotFoundException();

        return {
            referralCode: user.referralCode,
            totalReferrals: user.referrals.length,
            referrals: user.referrals,
            rewardBalance: user.rewardBalance,
            transactions: user.rewardTransactions,
        };
    }
}