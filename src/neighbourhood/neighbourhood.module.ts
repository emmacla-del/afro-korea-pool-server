import { Module } from '@nestjs/common';
import { NeighbourhoodService } from './neighbourhood.service';
import { NeighbourhoodController } from './neighbourhood.controller';
import { PrismaModule } from '../prisma/prisma.module'; // 👈 import PrismaModule

@Module({
    imports: [PrismaModule], // 👈 add PrismaModule here
    controllers: [NeighbourhoodController],
    providers: [NeighbourhoodService],
})
export class NeighbourhoodModule { }