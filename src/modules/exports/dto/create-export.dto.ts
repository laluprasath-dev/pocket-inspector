import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';
import { ExportTargetType } from '../../../../generated/prisma/enums';

export const SUPPORTED_EXPORT_TARGET_TYPES = [
  ExportTargetType.DOOR,
  ExportTargetType.FLOOR,
  ExportTargetType.BUILDING,
  ExportTargetType.SITE,
] as const;

export class CreateExportDto {
  @ApiProperty({ enum: SUPPORTED_EXPORT_TARGET_TYPES })
  @IsIn(SUPPORTED_EXPORT_TARGET_TYPES)
  targetType: ExportTargetType;

  @ApiProperty({
    description: 'ID of the target (door/floor/building/site)',
  })
  @IsString()
  targetId: string;
}
