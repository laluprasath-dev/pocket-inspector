import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateDoorDto {
  @ApiProperty({ description: 'Floor this door belongs to' })
  @IsString()
  floorId: string;

  @ApiProperty({
    example: 'D-101',
    description: 'Unique door code on the floor',
  })
  @IsString()
  @MinLength(1)
  code: string;

  @ApiPropertyOptional({ example: 'End of corridor, left side' })
  @IsOptional()
  @IsString()
  locationNotes?: string;
}
