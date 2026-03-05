import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateOrgDto {
  @ApiPropertyOptional({ example: 'Acme Inspections Ltd' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;
}
