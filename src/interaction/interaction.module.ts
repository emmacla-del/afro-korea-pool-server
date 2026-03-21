import { Module } from '@nestjs/common';
import { InteractionService } from './interaction.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [InteractionService],
  exports: [InteractionService],
})
export class InteractionModule {}