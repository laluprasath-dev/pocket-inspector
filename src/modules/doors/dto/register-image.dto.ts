import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
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
    description: 'Optional human-readable label, useful when role is OTHER',
    example: 'Hinge damage close-up',
    maxLength: 120,
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  @ApiPropertyOptional({
    description: 'Optional thumbnail path if client generates one',
  })
  @IsOptional()
  @IsString()
  objectPathThumb?: string;
}
