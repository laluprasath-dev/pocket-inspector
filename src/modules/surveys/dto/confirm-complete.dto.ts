import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsOptional, IsString, MinLength } from 'class-validator';

export class ConfirmCompleteDto {
  @ApiPropertyOptional({
    description: 'Schedule the next survey on this date/time (ISO 8601)',
    example: '2026-06-01T09:00:00Z',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  nextScheduledAt?: Date;

  @ApiPropertyOptional({
    description: 'Optional note about the next survey',
    example: 'Q2 annual inspection',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  nextScheduledNote?: string;

  @ApiPropertyOptional({
    description: 'Inspector user ID to assign to the next survey',
  })
  @IsOptional()
  @IsString()
  nextAssignedInspectorId?: string;
}
