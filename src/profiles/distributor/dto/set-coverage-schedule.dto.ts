import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsEnum, IsUUID, ValidateNested } from 'class-validator';
import { WeekDay } from '@prisma/client';

export class DistributorCoverageDayDto {
  @IsEnum(WeekDay)
  dayOfWeek: WeekDay;

  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  areaIds: string[];
}

export class SetCoverageScheduleDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DistributorCoverageDayDto)
  days: DistributorCoverageDayDto[];
}
