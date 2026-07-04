import { IsEnum, IsOptional, IsString } from 'class-validator';
import { SampleRequestStatus } from '@prisma/client';

export class UpdateSampleRequestStatusDto {
  @IsEnum(SampleRequestStatus)
  status: SampleRequestStatus='pending';

  @IsOptional()
  @IsString()
  rejectionReason?: string;
}
