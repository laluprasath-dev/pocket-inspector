import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { RequestImageUploadDto } from './request-image-upload.dto';

export class BatchRequestImageUploadDto {
  @ApiProperty({
    type: [RequestImageUploadDto],
    minItems: 1,
    maxItems: 10,
    description: 'Between 1 and 10 image upload requests',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => RequestImageUploadDto)
  images: RequestImageUploadDto[];
}
