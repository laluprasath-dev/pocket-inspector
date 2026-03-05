import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString } from 'class-validator';
import { ExportTargetType } from '../../../../generated/prisma/enums';

export class CreateExportDto {
  @ApiProperty({ enum: ExportTargetType })
  @IsEnum(ExportTargetType)
  targetType: ExportTargetType;

  @ApiProperty({
    description: 'ID of the target (door/floor/building/site/inspection)',
  })
  @IsString()
  targetId: string;
}
