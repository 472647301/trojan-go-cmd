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
  @IsNumber()
  @IsNotEmpty()
  ip: number

  @IsNumber()
  @IsNotEmpty()
  upload: number

  @IsNumber()
  @IsNotEmpty()
  download: number
}

export class TrojanItem {
  id: number
  status: number
}
