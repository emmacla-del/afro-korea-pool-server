import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CheckinService {
    constructor(private prisma: PrismaService) { }

    async checkIn(userId: string) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Check if already checked in today
        const existing = await this.prisma.userCheckIn.findUnique({
            where: {
                userId_checkInDate: {
                    userId,
                    checkInDate: today,
                },
            },
        });
        if (existing) throw new Error('Already checked in today');

        // Create check-in
        const checkin = await this.prisma.userCheckIn.create({
            data: {
                userId,
                checkInDate: today,
                // optional reward logic (e.g., after 7 days)
            },
        });
        return checkin;
    }

    async getStreak(userId: string) {
        // Implement streak logic: count consecutive days
        const checkins = await this.prisma.userCheckIn.findMany({
            where: { userId },
            orderBy: { checkInDate: 'desc' },
        });
        // ... calculate streak
        return { streak: 0, lastCheckIn: checkins[0]?.checkInDate };
    }
}