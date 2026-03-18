import { Module } from '@nestjs/common';
import { NeighbourhoodService } from './neighbourhood.service';
import { NeighbourhoodController } from './neighbourhood.controller';

@Module({
    controllers: [NeighbourhoodController],
    providers: [NeighbourhoodService],
})
export class NeighbourhoodModule { }