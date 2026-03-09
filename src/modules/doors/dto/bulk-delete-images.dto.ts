import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsString } from 'class-validator';

export class BulkDeleteImagesDto {
  @ApiProperty({
    type: [String],
    minItems: 1,
    maxItems: 20,
    description: 'IDs of the door images to permanently delete (1–20)',
    example: ['cmmit52890000xz1v...', 'cmmit55t80001xz1v...'],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  imageIds: string[];
}
