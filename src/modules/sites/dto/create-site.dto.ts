import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateSiteDto {
  @ApiProperty({ example: 'London Portfolio 2025' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiPropertyOptional({ example: 'SITE-001' })
  @IsOptional()
  @IsString()
  referenceCode?: string;

  @ApiPropertyOptional({ example: 'Near Tower Bridge, SE1' })
  @IsOptional()
  @IsString()
  locationNotes?: string;

  @ApiPropertyOptional({ description: 'Associate with a client (optional)' })
  @IsOptional()
  @IsString()
  clientId?: string;
}
