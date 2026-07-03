import {  IsUUID } from 'class-validator';

export class assignSampleRequestDto {
  @IsUUID()
  representativeId: string='';

}
