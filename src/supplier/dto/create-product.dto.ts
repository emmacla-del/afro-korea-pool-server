import { IsString, IsNumber, IsOptional, IsArray } from 'class-validator';

export class CreateProductDto {
    @IsString()
    title!: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsOptional()
    @IsString()
    categoryId?: string;

    @IsNumber()
    price!: number;

    // --- Add this line back! ---
    @IsOptional()
    @IsNumber()
    stock?: number;

    @IsOptional()
    @IsNumber()
    teamPrice?: number;

    @IsOptional()
    @IsNumber()
    minBuyers?: number;

    @IsOptional()
    @IsString()
    teamDealNeighbourhoodId?: string;

    @IsOptional()
    @IsArray()
    images?: string[];
}