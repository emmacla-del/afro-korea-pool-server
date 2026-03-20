import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Param,
    Body,
    UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
    constructor(private readonly adminService: AdminService) { }

    // ── Analytics ──────────────────────────────────────────────────────────────

    @Get('analytics/overview')
    getAnalyticsOverview() {
        return this.adminService.getAnalyticsOverview();
    }

    // ── Supplier verification ──────────────────────────────────────────────────

    @Get('suppliers/pending')
    getPendingSuppliers() {
        return this.adminService.getPendingSuppliers();
    }

    @Patch('suppliers/:id/verify')
    verifySupplier(@Param('id') supplierId: string) {
        return this.adminService.setSupplierVerificationStatus(supplierId, 'VERIFIED');
    }

    @Patch('suppliers/:id/reject')
    rejectSupplier(@Param('id') supplierId: string) {
        return this.adminService.setSupplierVerificationStatus(supplierId, 'REJECTED');
    }

    // ── User blocking ──────────────────────────────────────────────────────────

    @Get('users')
    getAllUsers() {
        return this.adminService.getAllUsers();
    }

    @Patch('users/:userId/block')
    blockUser(@Param('userId') userId: string) {
        return this.adminService.setUserBlockStatus(userId, true);
    }

    @Patch('users/:userId/unblock')
    unblockUser(@Param('userId') userId: string) {
        return this.adminService.setUserBlockStatus(userId, false);
    }

    // ── Product management ─────────────────────────────────────────────────────

    @Get('products')
    getAllProducts() {
        return this.adminService.getAllProducts();
    }

    @Patch('products/:id')
    updateProduct(
        @Param('id') productId: string,
        @Body() body: { title?: string; isActive?: boolean; categoryId?: string },
    ) {
        return this.adminService.updateProduct(productId, body);
    }

    @Patch('products/:id/variant')
    updateProductVariant(
        @Param('id') productId: string,
        @Body() body: { price?: number; stock?: number },
    ) {
        return this.adminService.updateProductVariant(productId, body);
    }

    @Delete('products/:id')
    deleteProduct(@Param('id') productId: string) {
        return this.adminService.deleteProduct(productId);
    }
}