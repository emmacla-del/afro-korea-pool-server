import { Controller, Get, Patch, Param, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
    constructor(private readonly adminService: AdminService) { }

    @Get('suppliers/pending')
    async getPendingSuppliers() {
        return this.adminService.getPendingSuppliers();
    }

    @Patch('suppliers/:id/verify')
    async verifySupplier(@Param('id') supplierId: string) {
        return this.adminService.verifySupplier(supplierId);
    }

    @Patch('suppliers/:id/reject')
    async rejectSupplier(@Param('id') supplierId: string) {
        return this.adminService.rejectSupplier(supplierId);
    }

    @Patch('users/:userId/block')
    async blockUser(@Param('userId') userId: string) {
        return this.adminService.setUserBlockStatus(userId, true);
    }

    @Patch('users/:userId/unblock')
    async unblockUser(@Param('userId') userId: string) {
        return this.adminService.setUserBlockStatus(userId, false);
    }
}