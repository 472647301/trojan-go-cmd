import { HttpException, HttpStatus } from '@nestjs/common'
import { ExceptionFilter as NestExceptionFilter } from '@nestjs/common'
import { Catch, ArgumentsHost } from '@nestjs/common'
import { Response, Request } from 'express'
import { Logs } from 'src/utils/logger'

const fetchStr = (temp: any) => {
  if (typeof temp === 'string') return temp
  let str = ''
  if (Array.isArray(temp)) {
    str = JSON.stringify(temp)
  } else if (Object.keys(temp).length) {
    if (temp.message) {
      str = temp.message
    } else if (temp.error) {
      str = temp.error
    } else {
      str = JSON.stringify(temp)
    }
  } else {
    str = JSON.stringify(temp)
  }
  return str
}

@Catch()
export class ExceptionFilter implements NestExceptionFilter {
  constructor() {}

  async catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const res = ctx.getResponse<Response>()
    const req = ctx.getRequest<Request>()
    let message: undefined | string
    if (exception instanceof HttpException) {
      const status = exception.getStatus()
      const response = exception.getResponse()
      if (typeof response === 'string') {
        message = response
      } else if (Array.isArray(response)) {
        message = response.map((e: any) => fetchStr(e)).join(',')
      } else if (Object.keys(response).length) {
        const temp = response as Record<string, string>
        if (temp.message) {
          message = temp.message
        } else if (temp.error) {
          message = temp.error
        } else {
          message = JSON.stringify(temp)
        }
      } else {
        message = JSON.stringify(response)
      }
      res.status(status).json({
        code: status,
        message: message
      })
    } else {
      Logs.err.error(req.originalUrl, exception)
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        code: HttpStatus.INTERNAL_SERVER_ERROR,
        message: fetchStr(exception)
      })
    }
  }
}
