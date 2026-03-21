// src/product/product.controller.ts
import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ProductService } from './product.service';

@Controller('products')
export class ProductController {
  constructor(private readonly productService: ProductService) { }

  /**
   * Main Marketplace Feed
   * GET /products?categoryId=...&sortBy=trending&search=iphone
   */
  @Get()
  async getProducts(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('categoryId') categoryId?: string,
    @Query('supplierId') supplierId?: string,
    @Query('sortBy') sortBy?: 'createdAt' | 'price' | 'popularity' | 'trending',
    @Query('order') order?: 'asc' | 'desc',
    @Query('search') search?: string,
    @Query('neighbourhoodId') neighbourhoodId?: string,
  ) {
    return this.productService.getProducts({
      skip: skip ? parseInt(skip) : 0,
      take: take ? parseInt(take) : 20,
      categoryId,
      supplierId,
      sortBy,
      order,
      search,
      neighbourhoodId,
    });
  }

  /**
   * Personalized "For You" Section
   * Requires a User ID (usually from a JWT guard)
   */
  @Get('personalized')
  async getPersonalized(@Query('userId') userId: string) {
    // In production, get userId from @Req() req.user.id after AuthGuard
    return this.productService.getPersonalizedProducts(userId);
  }

  /**
   * "Near You" Section
   */
  @Get('near-me/:neighbourhoodId')
  async getNearMe(@Param('neighbourhoodId') neighbourhoodId: string) {
    return this.productService.getProductsByNeighbourhood(neighbourhoodId);
  }

  /**
   * Single Product Detail
   * Tracks interaction automatically
   */
  @Get(':id')
  async getProduct(@Param('id') id: string, @Query('userId') userId?: string) {
    return this.productService.getProductById(id, userId);
  }
}