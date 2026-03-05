import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateBuildingDto {
  @ApiProperty({ example: 'Block A' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiPropertyOptional({ example: 'BLD-001' })
  @IsOptional()
  @IsString()
  buildingCode?: string;

  @ApiPropertyOptional({ example: 'Corner of King St and High St' })
  @IsOptional()
  @IsString()
  locationNotes?: string;

  @ApiPropertyOptional({ description: 'Associate with a site (optional)' })
  @IsOptional()
  @IsString()
  siteId?: string;
}
