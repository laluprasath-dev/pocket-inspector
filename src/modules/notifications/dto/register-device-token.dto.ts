import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, MinLength } from 'class-validator';
import { DevicePlatform } from '../../../../generated/prisma/enums';

export class RegisterDeviceTokenDto {
  @ApiProperty({ enum: DevicePlatform })
  @IsEnum(DevicePlatform)
  platform: DevicePlatform;

  @ApiProperty()
  @IsString()
  @MinLength(10)
  token: string;
}
