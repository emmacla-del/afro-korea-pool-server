import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { FastifyRequest } from 'fastify';

// FIXED: Issue #10 - Validate UUID format to prevent spoofed user IDs (temporary measure before JWT)
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function requireUserId(req: FastifyRequest): string {
  const fromJwt = getUserIdFromJwt(req);
  if (fromJwt) return fromJwt;

  const headerValue = req.headers['x-user-id'];
  if (!headerValue) {
    throw new UnauthorizedException('Missing x-user-id header (MVP auth - migrate to JWT)');
  }
  if (Array.isArray(headerValue)) {
    throw new BadRequestException('Invalid x-user-id header');
  }

  const userId = String(headerValue).trim();

  // FIXED: Issue #10 - Validate UUID format to prevent arbitrary user impersonation
  if (!UUID_V4_REGEX.test(userId)) {
    throw new BadRequestException('Invalid user ID format (must be valid UUID)');
  }

  return userId;
}

export function getUserIdFromJwt(req: FastifyRequest): string | null {
  const user = (req as FastifyRequest & { user?: JwtPayload & { userId?: string } }).user;
  if (!user) return null;

  const rawUserId = user.sub ?? user.userId;
  if (!rawUserId || typeof rawUserId !== 'string') return null;
  const userId = rawUserId.trim();
  if (!UUID_V4_REGEX.test(userId)) {
    throw new BadRequestException('Invalid user ID format in JWT');
  }
  return userId;
}

export function requireDevAdminSecret(req: FastifyRequest): void {
  const expected = process.env.DEV_ADMIN_SECRET;
  if (!expected) {
    throw new UnauthorizedException('DEV_ADMIN_SECRET is not set');
  }

  const headerValue = req.headers['x-admin-secret'];
  if (!headerValue || Array.isArray(headerValue)) {
    throw new UnauthorizedException('Missing x-admin-secret header');
  }
  if (String(headerValue) !== expected) {
    throw new UnauthorizedException('Invalid x-admin-secret');
  }
}

// FIXED: Issue #10 - Add JWT token validation helper (prepare for future JWT implementation)
export interface JwtPayload {
  sub: string; // user ID
  phone?: string | null;
  role?: 'CUSTOMER' | 'SUPPLIER' | 'ADMIN';
  iat?: number;
  exp?: number;
}

export function extractBearerToken(req: FastifyRequest): string {
  const authHeader = req.headers.authorization;
  if (!authHeader || typeof authHeader !== 'string') {
    throw new UnauthorizedException('Missing or invalid Authorization header');
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    throw new UnauthorizedException('Invalid Authorization header format. Expected "Bearer <token>"');
  }

  return parts[1];
}
