import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Body,
    Query,
    Req,
    Param,
    UseGuards,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AdminGuard } from '../auth/admin.guard';
import { NotBlockedGuard } from '../auth/not-blocked.guard';
import { requireUserId } from '../common/auth';
import { NotificationsService } from './notifications.service';

// ── Validation schemas ─────────────────────────────────────────────────────

const sendSchema = z.object({
    title: z.string().min(1).max(100),
    body: z.string().min(1).max(500),
    deepLink: z.string().url().optional(),
    audience: z.string().min(1),
    channels: z.array(z.enum(['PUSH', 'INAPP', 'WHATSAPP'])).min(1),
    scheduledAt: z.string().datetime().optional(),
});

const tokenSchema = z.object({
    token: z.string().min(1),
    platform: z.enum(['android', 'ios', 'web']),
});

// ══════════════════════════════════════════════════════════════════════════════

@Controller()
export class NotificationsController {
    constructor(private readonly notificationsService: NotificationsService) { }

    // ── Admin: send broadcast ──────────────────────────────────────────────────

    /**
     * POST /admin/notifications/send
     * Sends or schedules a notification across selected channels.
     * Body: { title, body, audience, channels, deepLink?, scheduledAt? }
     */
    @Post('/admin/notifications/send')
    @UseGuards(AdminGuard)
    async send(@Req() req: FastifyRequest, @Body() body: unknown) {
        const adminUserId = requireUserId(req);
        const input = sendSchema.parse(body);
        return this.notificationsService.sendNotification({
            ...input,
            adminUserId,
        });
    }

    /**
     * GET /admin/notifications/history
     * Paginated notification send history.
     */
    @Get('/admin/notifications/history')
    @UseGuards(AdminGuard)
    async history(
        @Query('page') page?: string,
        @Query('pageSize') pageSize?: string,
    ) {
        return this.notificationsService.getHistory(
            page ? Number(page) : 1,
            pageSize ? Number(pageSize) : 20,
        );
    }

    // ── User: in-app notifications ─────────────────────────────────────────────

    /**
     * GET /user/notifications
     * Returns the authenticated user's in-app notifications.
     */
    @Get('/user/notifications')
    @UseGuards(NotBlockedGuard)
    async getNotifications(
        @Req() req: FastifyRequest,
        @Query('page') page?: string,
        @Query('pageSize') pageSize?: string,
    ) {
        const userId = requireUserId(req);
        return this.notificationsService.getUserNotifications(
            userId,
            page ? Number(page) : 1,
            pageSize ? Number(pageSize) : 20,
        );
    }

    /**
     * GET /user/notifications/unread-count
     * Returns the unread notification count (for the bell badge).
     */
    @Get('/user/notifications/unread-count')
    @UseGuards(NotBlockedGuard)
    async unreadCount(@Req() req: FastifyRequest) {
        const userId = requireUserId(req);
        return this.notificationsService.getUnreadCount(userId);
    }

    /**
     * PATCH /user/notifications/:id/read
     * Marks a single notification as read.
     */
    @Patch('/user/notifications/:id/read')
    @UseGuards(NotBlockedGuard)
    async markRead(
        @Req() req: FastifyRequest,
        @Param('id') id: string,
    ) {
        const userId = requireUserId(req);
        return this.notificationsService.markNotificationRead(userId, id);
    }

    /**
     * PATCH /user/notifications/read-all
     * Marks all notifications as read.
     */
    @Patch('/user/notifications/read-all')
    @UseGuards(NotBlockedGuard)
    async markAllRead(@Req() req: FastifyRequest) {
        const userId = requireUserId(req);
        return this.notificationsService.markAllRead(userId);
    }

    // ── User: push token registration ──────────────────────────────────────────

    /**
     * POST /user/push-token
     * Registers a device FCM token after login.
     */
    @Post('/user/push-token')
    @UseGuards(NotBlockedGuard)
    async registerToken(@Req() req: FastifyRequest, @Body() body: unknown) {
        const userId = requireUserId(req);
        const { token, platform } = tokenSchema.parse(body);
        return this.notificationsService.registerPushToken(userId, token, platform);
    }

    /**
     * DELETE /user/push-token/:token
     * Removes a device token on logout.
     */
    @Delete('/user/push-token/:token')
    @UseGuards(NotBlockedGuard)
    async removeToken(@Param('token') token: string) {
        return this.notificationsService.removePushToken(token);
    }
}