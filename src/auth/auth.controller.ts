// src/auth/auth.controller.ts
import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request as NestRequest, // Aliased to avoid confusion
  Get,
  HttpCode,
  HttpStatus,
  ValidationPipe,
  UsePipes,
} from '@nestjs/common';
import { Request } from 'express'; // 👈 Import Request type from express
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { LocalAuthGuard } from './local-auth.guard';
import { LoginDto, RegisterDto } from './auth.dto'; // 👈 Removed /dto/

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) { }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ValidationPipe({ transform: true }))
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  @UseGuards(LocalAuthGuard)
  @HttpCode(HttpStatus.OK)
  async login(@NestRequest() req: Request) { // 👈 Added type : Request
    // req.user is usually added by Passport after successful LocalAuthGuard validation
    return this.authService.login(req.user);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  async getProfile(@NestRequest() req: Request) { // 👈 Added type : Request
    // Depending on your JwtStrategy, the user data is usually in req.user
    const user = req.user as any;
    return this.authService.getProfile(user.sub);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(@NestRequest() req: Request) { // 👈 Added type : Request
    const user = req.user as any;
    return this.authService.logout(user.sub);
  }
}