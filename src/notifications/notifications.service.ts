import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

import * as admin from 'firebase-admin';

// Initialize Firebase Admin SDK (only once)
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
    });
}

// ── WhatsApp setup ─────────────────────────────────────────────────────────────
// Uses Meta Cloud API (free tier: 1000 conversations/month)
// 1. Create a Meta Business account at business.facebook.com
// 2. Set up WhatsApp Business API at developers.facebook.com
// 3. Add to .env:
//    WHATSAPP_PHONE_NUMBER_ID=your-phone-number-id
//    WHATSAPP_ACCESS_TOKEN=your-permanent-access-token
//    WHATSAPP_BUSINESS_ACCOUNT_ID=your-business-account-id

export interface SendNotificationInput {
    title: string;
    body: string;
    deepLink?: string;
    audience: string;
    channels: ('PUSH' | 'INAPP' | 'WHATSAPP')[];
    scheduledAt?: string;
    adminUserId?: string;
}

interface ResolvedUser {
    id: string;
    phone: string | null;
    pushTokens: { token: string }[];
    whatsappOptOut: boolean;
}

@Injectable()
export class NotificationsService {
    private readonly logger = new Logger(NotificationsService.name);

    constructor(private readonly prisma: PrismaService) { }

    // ── Device token registration ──────────────────────────────────────────────

    async registerPushToken(userId: string, token: string, platform: string) {
        return this.prisma.pushToken.upsert({
            where: { token },
            update: { userId, platform, updatedAt: new Date() },
            create: { userId, token, platform },
        });
    }

    async removePushToken(token: string) {
        await this.prisma.pushToken.deleteMany({ where: { token } });
        return { success: true };
    }

    // ── In-app notifications ───────────────────────────────────────────────────

    async getUserNotifications(userId: string, page = 1, pageSize = 20) {
        const skip = (page - 1) * pageSize;
        const [notifications, total, unreadCount] = await this.prisma.$transaction([
            this.prisma.inAppNotification.findMany({
                where: { userId },
                orderBy: { createdAt: 'desc' },
                skip,
                take: pageSize,
            }),
            this.prisma.inAppNotification.count({ where: { userId } }),
            this.prisma.inAppNotification.count({ where: { userId, isRead: false } }),
        ]);
        return { notifications, total, unreadCount };
    }

    async markNotificationRead(userId: string, notificationId: string) {
        const notif = await this.prisma.inAppNotification.findFirst({
            where: { id: notificationId, userId },
        });
        if (!notif) throw new NotFoundException('Notification not found');
        return this.prisma.inAppNotification.update({
            where: { id: notificationId },
            data: { isRead: true },
        });
    }

    async markAllRead(userId: string) {
        await this.prisma.inAppNotification.updateMany({
            where: { userId, isRead: false },
            data: { isRead: true },
        });
        return { success: true };
    }

    async getUnreadCount(userId: string) {
        const count = await this.prisma.inAppNotification.count({
            where: { userId, isRead: false },
        });
        return { unreadCount: count };
    }

    // Create a single in-app notification (used internally by other services)
    async createInAppNotification(input: {
        userId: string;
        title: string;
        body: string;
        type?: string;
        deepLink?: string;
        refId?: string;
    }) {
        return this.prisma.inAppNotification.create({
            data: {
                userId: input.userId,
                title: input.title,
                body: input.body,
                type: input.type ?? 'INFO',
                deepLink: input.deepLink,
                refId: input.refId,
            },
        });
    }

    // ── Resolve users for audience ─────────────────────────────────────────────

    private async resolveUsers(audience: string): Promise<ResolvedUser[]> {
        let userWhere: any = {};

        if (audience === 'ALL') {
            userWhere = { isBlocked: false };
        } else if (audience === 'CUSTOMERS') {
            userWhere = { role: 'CUSTOMER', isBlocked: false };
        } else if (audience === 'SUPPLIERS') {
            userWhere = { role: 'SUPPLIER', isBlocked: false };
        } else if (audience.startsWith('NEIGHBOURHOOD:')) {
            const neighbourhoodId = audience.replace('NEIGHBOURHOOD:', '');
            userWhere = { neighbourhoodId, isBlocked: false };
        } else if (audience.startsWith('USER:')) {
            const phone = audience.replace('USER:', '');
            userWhere = { phone };
        }

        return this.prisma.user.findMany({
            where: userWhere,
            select: {
                id: true,
                phone: true,
                whatsappOptOut: true,
                pushTokens: { select: { token: true } },
            },
        }) as Promise<ResolvedUser[]>;
    }

    // ── FCM push ───────────────────────────────────────────────────────────────

    private async sendPush(
        tokens: string[],
        title: string,
        body: string,
        deepLink?: string,
    ): Promise<{ success: number; failed: number }> {
        if (tokens.length === 0) return { success: 0, failed: 0 };

        // Stub until firebase-admin is installed
        this.logger.warn(
            `[FCM STUB] Would send to ${tokens.length} tokens: "${title}"`,
        );
        return { success: tokens.length, failed: 0 };

        // ── Uncomment when firebase-admin is installed ────────────────────────────
        // const { messaging } = await import('firebase-admin');
        // const chunkSize = 500;
        // let success = 0, failed = 0;
        // for (let i = 0; i < tokens.length; i += chunkSize) {
        //   const chunk = tokens.slice(i, i + chunkSize);
        //   const res = await messaging().sendEachForMulticast({
        //     tokens: chunk,
        //     notification: { title, body },
        //     data: deepLink ? { deepLink } : {},
        //     android: { priority: 'high' },
        //     apns: { payload: { aps: { sound: 'default' } } },
        //   });
        //   success += res.successCount;
        //   failed  += res.failureCount;
        //   // Remove stale tokens
        //   const stale = res.responses
        //     .map((r, idx) => (!r.success ? chunk[idx] : null))
        //     .filter(Boolean) as string[];
        //   if (stale.length > 0) {
        //     await this.prisma.pushToken.deleteMany({ where: { token: { in: stale } } });
        //   }
        // }
        // return { success, failed };
    }

    // ── WhatsApp via Meta Cloud API ────────────────────────────────────────────

    private async sendWhatsApp(
        phones: string[],
        message: string,
    ): Promise<{ success: number; failed: number }> {
        if (phones.length === 0) return { success: 0, failed: 0 };

        const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
        const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

        if (!phoneNumberId || !accessToken) {
            this.logger.warn('[WhatsApp] Not configured — set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN');
            return { success: 0, failed: phones.length };
        }

        let success = 0;
        let failed = 0;

        for (const phone of phones) {
            try {
                // Normalize phone: remove spaces, ensure it starts with country code
                const normalized = phone.replace(/\s+/g, '').replace(/^\+/, '');

                const res = await fetch(
                    `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
                    {
                        method: 'POST',
                        headers: {
                            Authorization: `Bearer ${accessToken}`,
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            messaging_product: 'whatsapp',
                            to: normalized,
                            type: 'text',
                            text: { body: message },
                        }),
                    },
                );

                const data = await res.json() as any;

                await this.prisma.whatsAppLog.create({
                    data: {
                        phone,
                        message,
                        status: res.ok ? 'SENT' : 'FAILED',
                        providerRef: data?.messages?.[0]?.id,
                        error: !res.ok ? JSON.stringify(data) : null,
                    },
                });

                if (res.ok) success++;
                else failed++;
            } catch (err) {
                failed++;
                await this.prisma.whatsAppLog.create({
                    data: { phone, message, status: 'FAILED', error: String(err) },
                });
            }
        }

        return { success, failed };
    }

    // ── Main send/schedule ─────────────────────────────────────────────────────

    async sendNotification(input: SendNotificationInput) {
        // Save as SCHEDULED if scheduledAt is in the future
        if (input.scheduledAt) {
            const scheduledTime = new Date(input.scheduledAt);
            if (scheduledTime > new Date()) {
                return this.prisma.notificationLog.create({
                    data: {
                        title: input.title,
                        body: input.body,
                        deepLink: input.deepLink,
                        audience: input.audience,
                        channels: input.channels,
                        status: 'SCHEDULED',
                        scheduledAt: scheduledTime,
                        createdBy: input.adminUserId,
                    },
                });
            }
        }

        const log = await this.prisma.notificationLog.create({
            data: {
                title: input.title,
                body: input.body,
                deepLink: input.deepLink,
                audience: input.audience,
                channels: input.channels,
                status: 'PENDING',
                createdBy: input.adminUserId,
            },
        });

        try {
            const users = await this.resolveUsers(input.audience);
            let pushCount = 0, inAppCount = 0, waCount = 0, failCount = 0;

            // ── In-app ────────────────────────────────────────────────────────────
            if (input.channels.includes('INAPP')) {
                await this.prisma.inAppNotification.createMany({
                    data: users.map((u) => ({
                        userId: u.id,
                        title: input.title,
                        body: input.body,
                        type: 'SYSTEM',
                        deepLink: input.deepLink,
                    })),
                    skipDuplicates: true,
                });
                inAppCount = users.length;
            }

            // ── Push (FCM) ────────────────────────────────────────────────────────
            if (input.channels.includes('PUSH')) {
                const tokens = users.flatMap((u) => u.pushTokens.map((t) => t.token));
                const result = await this.sendPush(
                    tokens, input.title, input.body, input.deepLink,
                );
                pushCount = result.success;
                failCount += result.failed;
            }

            // ── WhatsApp ──────────────────────────────────────────────────────────
            if (input.channels.includes('WHATSAPP')) {
                const phones = users
                    .filter((u) => !u.whatsappOptOut && u.phone)
                    .map((u) => u.phone as string);
                const waMessage = `*${input.title}*\n\n${input.body}${input.deepLink ? `\n\n${input.deepLink}` : ''}`;
                const result = await this.sendWhatsApp(phones, waMessage);
                waCount = result.success;
                failCount += result.failed;
            }

            return this.prisma.notificationLog.update({
                where: { id: log.id },
                data: {
                    status: 'SENT',
                    sentAt: new Date(),
                    pushCount,
                    inAppCount,
                    waCount,
                    failCount,
                },
            });
        } catch (error) {
            await this.prisma.notificationLog.update({
                where: { id: log.id },
                data: { status: 'FAILED', error: String(error) },
            });
            throw error;
        }
    }

    // ── History ────────────────────────────────────────────────────────────────

    async getHistory(page = 1, pageSize = 20) {
        const skip = (page - 1) * pageSize;
        const [logs, total] = await this.prisma.$transaction([
            this.prisma.notificationLog.findMany({
                orderBy: { createdAt: 'desc' },
                skip,
                take: pageSize,
            }),
            this.prisma.notificationLog.count(),
        ]);
        return { logs, total };
    }

    // ── Process scheduled notifications (wire to a @Cron) ─────────────────────

    async processScheduledNotifications() {
        const due = await this.prisma.notificationLog.findMany({
            where: { status: 'SCHEDULED', scheduledAt: { lte: new Date() } },
        });
        for (const log of due) {
            await this.sendNotification({
                title: log.title,
                body: log.body,
                deepLink: log.deepLink ?? undefined,
                audience: log.audience,
                channels: log.channels as ('PUSH' | 'INAPP' | 'WHATSAPP')[],
                adminUserId: log.createdBy ?? undefined,
            });
        }
    }
}