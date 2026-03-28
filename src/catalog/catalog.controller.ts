// src/catalog/catalog.controller.ts
import { Controller, Get, Param } from '@nestjs/common';
import { CatalogService } from './catalog.service';

@Controller()
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) { }

  // Public browse (customer side)
  @Get('/products')
  async listPublicProducts() {
    return this.catalogService.listPublicProducts();
  }

  // Get a single product by ID
  @Get('/products/:id')
  async getProduct(@Param('id') id: string) {
    return this.catalogService.findOne(id);
  }
}