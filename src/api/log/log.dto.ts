import { IsString, IsNotEmpty } from 'class-validator'

export class LogPageDto {
  page?: number
  pageSize?: number

  @IsString()
  @IsNotEmpty()
  filename: string
}

export class LogItem {
  timestamp: string
  level: string
  category: string
  message: string
  raw: string
}
