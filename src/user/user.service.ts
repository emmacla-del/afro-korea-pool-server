import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UserService {
    constructor(private prisma: PrismaService) { }

    async getProfile(userId: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: {
                neighbourhood: {
                    include: {
                        division: {
                            include: {
                                region: true,
                            },
                        },
                    },
                },
                supplier: true, // 👈 added: include supplier details
            },
        });
        if (!user) throw new NotFoundException('User not found');
        return user;
    }

    async updateProfile(userId: string, data: { neighbourhoodId?: string }) {
        const updateData: any = {};
        if (data.neighbourhoodId !== undefined) {
            updateData.neighbourhood = data.neighbourhoodId
                ? { connect: { id: data.neighbourhoodId } }
                : { disconnect: true };
        }
        return this.prisma.user.update({
            where: { id: userId },
            data: updateData,
            include: {
                neighbourhood: {
                    include: {
                        division: {
                            include: {
                                region: true,
                            },
                        },
                    },
                },
                supplier: true, // 👈 added for consistency
            },
        });
    }
}