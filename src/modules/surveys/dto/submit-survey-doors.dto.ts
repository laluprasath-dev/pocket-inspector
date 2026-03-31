import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsString,
} from 'class-validator';

export class SubmitSurveyDoorsDto {
  @ApiProperty({
    description:
      'Selected active-survey door IDs to bulk-submit. Only DRAFT doors with at least one image will be submitted.',
    type: [String],
    example: ['cmdoor1', 'cmdoor2'],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsString({ each: true })
  doorIds!: string[];
}
