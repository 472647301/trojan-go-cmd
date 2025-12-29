import { IsString, IsNumber, IsNotEmpty } from 'class-validator'

export enum UserAction {
  add = 'add',
  del = 'del',
  find = 'find'
}

export class TrojanUserDto {
  @IsString()
  @IsNotEmpty()
  action: UserAction
}

export class TrojanLimitDto {
  @IsString()
  @IsNotEmpty()
  ip: number

  @IsNumber()
  @IsNotEmpty()
  upload: number

  @IsNumber()
  @IsNotEmpty()
  download: number
}
