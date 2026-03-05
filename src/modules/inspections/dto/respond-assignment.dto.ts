import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { AssignmentStatus } from '../../../../generated/prisma/enums';

const ALLOWED = [AssignmentStatus.ACCEPTED, AssignmentStatus.DECLINED] as const;

export class RespondAssignmentDto {
  @ApiProperty({ enum: ALLOWED })
  @IsEnum(ALLOWED)
  status: (typeof ALLOWED)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  inspectorNote?: string;
}
