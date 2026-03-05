import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateFloorDto {
  @ApiProperty({ description: 'Building this floor belongs to' })
  @IsString()
  buildingId: string;

  @ApiPropertyOptional({
    example: 'G',
    description: 'Floor label (e.g. G, 1, B1)',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  label?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
