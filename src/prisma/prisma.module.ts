// src/prisma/prisma.module.ts
import { Global, Module } from '@nestjs/common'; // Add Global
import { PrismaService } from './prisma.service';

@Global() // Add this decorator
@Module({
    providers: [PrismaService],
    exports: [PrismaService],
})
export class PrismaModule { }