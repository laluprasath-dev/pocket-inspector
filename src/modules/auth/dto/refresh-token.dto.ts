import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  refreshToken: string;

  @ApiPropertyOptional({ description: 'Same deviceId sent at login — used to verify token belongs to this device' })
  @IsOptional()
  @IsString()
  deviceId?: string;
}
