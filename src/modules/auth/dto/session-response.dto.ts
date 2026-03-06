import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SessionResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() deviceId: string;
  @ApiPropertyOptional() deviceName?: string | null;
  @ApiPropertyOptional() deviceType?: string | null;
  @ApiPropertyOptional() ipAddress?: string | null;
  @ApiProperty() lastUsedAt: Date;
  @ApiProperty() createdAt: Date;
  @ApiProperty() expiresAt: Date;
  @ApiProperty() isCurrent: boolean;
}
