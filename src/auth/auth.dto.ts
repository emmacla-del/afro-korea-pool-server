// src/auth/dto/auth.dto.ts
import { IsPhoneNumber, IsString, MinLength, MaxLength, IsOptional, IsEnum, IsObject } from 'class-validator';
import { UserRole } from '@prisma/client';

export class RegisterDto {
    @IsPhoneNumber('CM')
    @IsString()
    phone!: string; // Added !

    @IsString()
    @MinLength(6)
    @MaxLength(50)
    password!: string; // Added !

    @IsEnum(UserRole)
    @IsOptional()
    role?: UserRole;

    @IsString()
    @IsOptional()
    name?: string;

    @IsString()
    @IsOptional()
    referralCode?: string;

    @IsObject()
    @IsOptional()
    supplierData?: {
        displayName: string;
        country: string;
        city?: string;
        businessRegNumber?: string;
    };
}

export class LoginDto {
    @IsPhoneNumber('CM')
    @IsString()
    phone!: string; // Added !

    @IsString()
    @MinLength(6)
    password!: string; // Added !
}

export class RefreshTokenDto {
    @IsString()
    refreshToken!: string; // Added !
}

export class AuthResponseDto {
    access_token!: string; // Added !
    refresh_token?: string;
    user!: {               // Added !
        id: string;
        phone: string;
        role: string;
        name: string | null;
        isBlocked: boolean;
        neighbourhoodId?: string | null;
        totalPoints?: number;
    };
}