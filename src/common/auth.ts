import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { FastifyRequest } from 'fastify';

export function requireUserId(req: FastifyRequest): string {
  const headerValue = req.headers['x-user-id'];
  if (!headerValue) {
    throw new UnauthorizedException('Missing x-user-id header (MVP auth)');
  }
  if (Array.isArray(headerValue)) {
    throw new BadRequestException('Invalid x-user-id header');
  }
  return String(headerValue);
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
