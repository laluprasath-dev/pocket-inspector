import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class AssignBuildingDto {
  @ApiProperty({ description: 'Building ID to assign' })
  @IsString()
  buildingId: string;

  @ApiProperty({ description: 'Photographer user ID' })
  @IsString()
  inspectorId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  adminNote?: string;

  @ApiPropertyOptional({
    description:
      'Optional survey ID for survey-version-linked assignment (typically a PLANNED or ACTIVE survey)',
  })
  @IsOptional()
  @IsString()
  surveyId?: string;
}
