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
    let msg: string | undefined
    const req = context.switchToHttp().getRequest<Request>()
    const headers = req.headers

    // 2. 检查 Content-Type
    const contentType = headers['content-type'] || headers['Content-Type']

    let isFileUpload = false

    if (contentType && typeof contentType === 'string') {
      // 3. 判断是否为 multipart/form-data 类型
      // 使用 .startsWith() 是因为 Content-Type 后面通常会跟 boundary 信息
      isFileUpload = contentType.startsWith('multipart/form-data')
    }
    if (!isFileUpload) {
      if (req.body) {
        msg = JSON.stringify(req.body)
      } else if (req.query) {
        msg = JSON.stringify(req.query)
      }
    }
    Logs.app.info(fetchIP(req), req.originalUrl, msg)
    return next.handle().pipe(map(data => data))
  }
}
