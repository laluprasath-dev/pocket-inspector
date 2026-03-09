import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { RegisterImageDto } from './register-image.dto';

export class BatchRegisterImageDto {
  @ApiProperty({
    type: [RegisterImageDto],
    minItems: 1,
    maxItems: 10,
    description: 'Between 1 and 10 images to register after GCS upload',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => RegisterImageDto)
  images: RegisterImageDto[];
}
