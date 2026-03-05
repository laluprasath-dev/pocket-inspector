import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ImageRole } from '../../../../generated/prisma/enums';

export class RequestImageUploadDto {
  @ApiProperty({ enum: ImageRole })
  @IsEnum(ImageRole)
  role: ImageRole;

  @ApiPropertyOptional({ example: 'image/jpeg', default: 'image/jpeg' })
  @IsOptional()
  @IsString()
  contentType?: string = 'image/jpeg';
}
