import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class RegisterDoorCertificateDto {
  @ApiProperty({ description: 'The certId returned from signed-upload' })
  @IsString()
  certId: string;

  @ApiProperty({
    description: 'The GCS object path of the uploaded certificate PDF',
  })
  @IsString()
  objectPath: string;
}
