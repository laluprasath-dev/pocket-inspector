import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
} from 'class-validator';

export class AssignSiteBuildingsDto {
  @ApiProperty({ description: 'Photographer user ID' })
  @IsString()
  inspectorId: string;

  @ApiPropertyOptional({
    description:
      'Optional subset of current building IDs under the site. If omitted, all current site buildings are assigned.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  buildingIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  adminNote?: string;

  @ApiPropertyOptional({
    description:
      'Optional survey ID for survey-version-linked assignment. When provided, only one building can be targeted.',
  })
  @IsOptional()
  @IsString()
  surveyId?: string;
}
