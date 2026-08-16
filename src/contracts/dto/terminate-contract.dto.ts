import { IsString, MinLength } from 'class-validator';

export class TerminateContractDto {
  @IsString()
  @MinLength(3)
  reason: string;
}
