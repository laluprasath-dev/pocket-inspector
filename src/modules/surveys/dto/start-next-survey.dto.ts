import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsOptional, IsString, MinLength } from 'class-validator';

export class StartNextSurveyDto {
  @ApiPropertyOptional({
    description: 'Optional planned start date/time for the next survey (ISO 8601)',
    example: '2026-07-01T09:00:00Z',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  nextScheduledAt?: Date;

  @ApiPropertyOptional({
    description: 'Optional note for the planned next survey',
    example: 'Q3 compliance round',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  nextScheduledNote?: string;

  @ApiPropertyOptional({
    description: 'Optional photographer user ID associated with this planned survey (not an assignment)',
  })
  @IsOptional()
  @IsString()
  nextAssignedInspectorId?: string;

  @ApiPropertyOptional({
    description:
      'Deprecated alias for nextAssignedInspectorId retained for compatibility',
  })
  @IsOptional()
  @IsString()
  assignedInspectorId?: string;
}
