import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { InspectionType } from '../../../../generated/prisma/enums';

export class CreateInspectionDto {
  @ApiProperty({ enum: InspectionType })
  @IsEnum(InspectionType)
  type: InspectionType;

  @ApiPropertyOptional({ description: 'Required when type is SITE' })
  @IsOptional()
  @IsString()
  siteId?: string;

  @ApiPropertyOptional({ description: 'Required when type is BUILDING' })
  @IsOptional()
  @IsString()
  buildingId?: string;
}
