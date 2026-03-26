// src/auth/local.strategy.ts
import { Strategy } from 'passport-local';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
    constructor(private authService: AuthService) {
        super({ usernameField: 'phone' }); // 👈 Tell passport to use 'phone' field
    }

    async validate(phone: string, password: string): Promise<any> {
        const user = await this.authService.validateUser(phone, password);
        if (!user) {
            throw new UnauthorizedException({
                message: 'Invalid credentials',
                code: 'INVALID_CREDENTIALS',
            });
        }
        return user;
    }
}