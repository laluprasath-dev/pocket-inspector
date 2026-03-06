import { ApiProperty } from '@nestjs/swagger';

export class TokenResponseDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty()
  refreshToken: string;

  @ApiProperty({
    description: 'The device ID assigned to this session. Store securely and reuse on future logins.',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  deviceId: string;
}
