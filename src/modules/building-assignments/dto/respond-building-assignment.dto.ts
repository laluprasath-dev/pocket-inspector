import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { BuildingAssignmentStatus } from '../../../../generated/prisma/enums';

const ALLOWED = [
  BuildingAssignmentStatus.ACCEPTED,
  BuildingAssignmentStatus.REJECTED,
] as const;

export class RespondBuildingAssignmentDto {
  @ApiProperty({ enum: ALLOWED })
  @IsEnum(ALLOWED)
  status: (typeof ALLOWED)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  inspectorNote?: string;
}
