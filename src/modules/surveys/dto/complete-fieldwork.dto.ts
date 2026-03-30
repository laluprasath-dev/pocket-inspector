import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class CompleteFieldworkDto {
  @ApiPropertyOptional({
    description:
      'When true, auto-submit any DRAFT doors that already have images before completing fieldwork. Doors with no images still block completion.',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  autoSubmitValidDoors?: boolean;
}
