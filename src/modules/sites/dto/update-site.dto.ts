import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';

export class UpdateSiteDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  referenceCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  locationNotes?: string;

  @ApiPropertyOptional({
    description: 'Set or change the client. Pass null to unlink.',
  })
  @ValidateIf((o: UpdateSiteDto) => o.clientId !== null)
  @IsOptional()
  @IsString()
  clientId?: string | null;
}
