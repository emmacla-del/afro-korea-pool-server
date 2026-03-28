// src/product/dto/get-products.dto.ts
import { IsOptional, IsString, IsEnum, IsNumber, IsBooleanString } from 'class-validator';
import { Type } from 'class-transformer';

export class GetProductsDto {
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    skip?: number = 0;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    take?: number = 20;

    @IsOptional()
    @IsString()
    categoryId?: string;

    @IsOptional()
    @IsString()
    supplierId?: string;

    @IsOptional()
    @IsEnum(['createdAt', 'price', 'popularity', 'trending'])
    sortBy?: 'createdAt' | 'price' | 'popularity' | 'trending';

    @IsOptional()
    @IsEnum(['asc', 'desc'])
    order?: 'asc' | 'desc' = 'desc';

    @IsOptional()
    @IsString()
    search?: string;

    @IsOptional()
    @IsString()
    neighbourhoodId?: string;

    @IsOptional()
    @IsBooleanString()
    hasTeamDeal?: string;
}