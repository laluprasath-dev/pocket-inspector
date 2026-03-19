import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';

export class UpdateBuildingDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  buildingCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  locationNotes?: string;

  @ApiPropertyOptional({
    description:
      'Set or change the client (only for standalone buildings). Pass null to unlink.',
  })
  @ValidateIf((o: UpdateBuildingDto) => o.clientId !== null)
  @IsOptional()
  @IsString()
  clientId?: string | null;
}
