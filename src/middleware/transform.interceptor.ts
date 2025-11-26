import { Injectable, NestInterceptor } from '@nestjs/common'
import { ExecutionContext, CallHandler } from '@nestjs/common'
import { map } from 'rxjs/operators'
import { Observable } from 'rxjs'
import { Request } from 'express'
import { Logs } from 'src/utils/logger'
import { fetchIP } from 'src/utils'

type TRes = {
  data: object
  code: number
  message?: string
}

@Injectable()
export class TransformInterceptor implements NestInterceptor<object, TRes> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<TRes> {
    const req = context.switchToHttp().getRequest<Request>()
    const data = Object.keys(req.body).length ? req.body : req.query
    Logs.app.info(
      fetchIP(req),
      req.originalUrl,
      Object.keys(data).length ? JSON.stringify(data) : undefined
    )
    return next.handle().pipe(map(data => data))
  }
}
