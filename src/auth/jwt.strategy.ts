import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { UserRole } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';

export interface JwtAuthPayload {
  sub: string;
  phone: string | null;
  role: UserRole;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        process.env.JWT_SECRET ?? 'dev-only-insecure-jwt-secret-change-me',
    });
  }

  validate(payload: JwtAuthPayload): JwtAuthPayload {
    if (!payload?.sub) {
      throw new UnauthorizedException('Invalid token payload');
    }
    return payload;
  }
}
