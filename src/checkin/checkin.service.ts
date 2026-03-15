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
        if (existing) {
            throw new Error('Already checked in today');
        }

        // Create the check‑in record
        const checkin = await this.prisma.userCheckIn.create({
            data: {
                userId,
                checkInDate: today,
                // You can add reward logic here, e.g., after 7 consecutive days
                // reward: 10,
            },
        });

        return checkin;
    }

    async getStreak(userId: string) {
        const checkins = await this.prisma.userCheckIn.findMany({
            where: { userId },
            orderBy: { checkInDate: 'desc' },
        });

        if (checkins.length === 0) {
            return { streak: 0, lastCheckIn: null };
        }

        let streak = 1;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Check if last check‑in was today
        const last = checkins[0].checkInDate;
        const lastDate = new Date(last);
        lastDate.setHours(0, 0, 0, 0);

        if (lastDate.getTime() !== today.getTime()) {
            // Last check‑in was not today – streak is 0 or we only count consecutive days from today
            return { streak: 0, lastCheckIn: last };
        }

        // Count consecutive days backwards
        for (let i = 1; i < checkins.length; i++) {
            const prevDate = new Date(checkins[i].checkInDate);
            prevDate.setHours(0, 0, 0, 0);
            const expectedPrev = new Date(lastDate);
            expectedPrev.setDate(expectedPrev.getDate() - i);
            if (prevDate.getTime() === expectedPrev.getTime()) {
                streak++;
            } else {
                break;
            }
        }

        return { streak, lastCheckIn: last };
    }
}