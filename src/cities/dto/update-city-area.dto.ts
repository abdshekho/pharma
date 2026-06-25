import { PartialType } from '@nestjs/mapped-types';
import { CreateCityAreaDto } from './create-city-area.dto';

export class UpdateCityAreaDto extends PartialType(CreateCityAreaDto) {}
