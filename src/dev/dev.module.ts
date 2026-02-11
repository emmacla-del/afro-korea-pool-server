import { Module } from '@nestjs/common';
import { DevController } from './dev.controller';
import { DevService } from './dev.service';
import { PrismaModule } from '../prisma/prisma.module'; // Add

@Module({
  imports: [PrismaModule], // Add
  controllers: [DevController],
  providers: [DevService],
})
export class DevModule { }