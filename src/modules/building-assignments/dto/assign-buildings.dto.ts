import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
} from 'class-validator';

export class AssignBuildingsDto {
  @ApiProperty({ description: 'Inspector user ID' })
  @IsString()
  inspectorId: string;

  @ApiProperty({
    description: 'Building IDs to assign in a single request',
    type: [String],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsString({ each: true })
  buildingIds: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  adminNote?: string;

  @ApiPropertyOptional({
    description:
      'Optional survey ID for survey-version-linked assignment. When provided, requests must target one building.',
  })
  @IsOptional()
  @IsString()
  surveyId?: string;
}
