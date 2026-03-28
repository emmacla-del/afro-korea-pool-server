import { IsString, IsNumber, IsOptional, IsArray } from 'class-validator';

export class CreateProductDto {
    @IsString()
    title!: string; // Added ! here

    @IsOptional()
    @IsString()
    description?: string;

    @IsString()
    categoryId!: string; // Added ! here

    @IsNumber()
    price!: number; // Added ! here

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