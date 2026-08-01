import { IsInt, IsOptional, IsString, IsUUID, Min, IsNumber } from 'class-validator';

export class CreateReturnDto {
  @IsUUID()
  productId: string='';

  @IsInt()
  @Min(1)
  quantity: number=0;

  @IsOptional()
  @IsString()
  note?: string;
}

export class CreateDisposalDto {
  @IsUUID()
  productId: string='';

  @IsInt()
  @Min(1)
  quantity: number=0;

  @IsOptional()
  @IsString()
  note?: string;
}

export class CreateCashWithdrawalDto {
  @IsNumber()
  @Min(0.01)
  amount: number=0;

  @IsOptional()
  @IsString()
  reason?: string;
}
