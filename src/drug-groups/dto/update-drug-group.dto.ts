import { PartialType } from '@nestjs/mapped-types';
import { CreateDrugGroupDto } from './create-drug-group.dto';

export class UpdateDrugGroupDto extends PartialType(CreateDrugGroupDto) {}
