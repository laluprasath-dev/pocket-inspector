import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ImageRole } from '../../../../generated/prisma/enums';

export class RegisterImageDto {
  @ApiProperty({ description: 'The imageId returned from signed-upload' })
  @IsString()
  imageId: string;

  @ApiProperty()
  @IsString()
  objectPath: string;

  @ApiProperty({ enum: ImageRole })
  @IsEnum(ImageRole)
  role: ImageRole;

  @ApiPropertyOptional({
    description: 'Optional thumbnail path if client generates one',
  })
  @IsOptional()
  @IsString()
  objectPathThumb?: string;
}
