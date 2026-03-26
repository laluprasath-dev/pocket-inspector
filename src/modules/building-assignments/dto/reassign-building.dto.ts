import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ReassignBuildingDto {
  @ApiProperty({ description: 'New inspector user ID' })
  @IsString()
  inspectorId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  adminNote?: string;

  @ApiPropertyOptional({
    description:
      'Optional survey ID for survey-version-linked reassignment (typically a PLANNED or ACTIVE survey)',
  })
  @IsOptional()
  @IsString()
  surveyId?: string;
}
