import { AppModule } from './app'
import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { ExceptionFilter } from './middleware/exception.filter'
import { TransformInterceptor } from './middleware/transform.interceptor'
import { NestExpressApplication } from '@nestjs/platform-express'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { log4jsConfigure } from './utils/logger'
import { ConfigService } from '@nestjs/config'
import { urlencoded, json } from 'express'
import compression from 'compression'
import * as dotenv from 'dotenv'
import * as Log4js from 'log4js'
import helmet from 'helmet'

dotenv.config({ path: ['.env.local', '.env'] })

Log4js.configure(log4jsConfigure())

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true
  })

  const configService = app.get(ConfigService)

  app.useGlobalFilters(new ExceptionFilter())
  app.useGlobalInterceptors(new TransformInterceptor())
  app.useGlobalPipes(
    new ValidationPipe({
      exceptionFactory(errors) {
        const str = 'Parameter error'
        if (!errors.length) return str
        const temp = errors[0].constraints
        if (!temp || !Object.keys(temp).length) return str
        const errKeys = Object.keys(temp)
        return temp[errKeys[0]] || str
      }
    })
  )
  app.use(urlencoded({ extended: true, limit: '50mb' }))
  app.use(json({ limit: '50mb' }))
  app.setGlobalPrefix('api')
  app.set('trust proxy', 1)
  app.use(compression())
  app.use(helmet())

  const builder = new DocumentBuilder()
  const document = SwaggerModule.createDocument(app, builder.build())
  SwaggerModule.setup('api/docs', app, document)

  await app.listen(configService.get('PORT') || 8086)
}

bootstrap()
