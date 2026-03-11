import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class StartNextSurveyDto {
  @ApiPropertyOptional({
    description:
      'Optional inspector user ID to pre-assign to the new survey (for notification purposes)',
  })
  @IsOptional()
  @IsString()
  assignedInspectorId?: string;
}
