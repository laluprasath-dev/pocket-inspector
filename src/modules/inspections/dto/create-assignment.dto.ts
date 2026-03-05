import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreateAssignmentDto {
  @ApiProperty({ description: 'ID of the inspector to assign' })
  @IsString()
  inspectorId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  adminNote?: string;
}
