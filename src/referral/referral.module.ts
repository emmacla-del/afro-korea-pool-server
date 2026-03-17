import { Module } from '@nestjs/common';
import { ReferralController } from './referral.controller';
import { ReferralService } from './referral.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    controllers: [ReferralController],
    providers: [ReferralService],
    exports: [ReferralService],   // 👈 ADD THIS
})
export class ReferralModule { }