import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { TrojanModule } from './api/trojan/trojan.module'
import { LogModule } from './api/log/log.module'
import { ScheduleModule } from '@nestjs/schedule'
import { TypeOrmModule } from '@nestjs/typeorm'
import { join } from 'path'
import { DatabaseLogger } from './utils/logger'

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env']
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'mysql',
        host: configService.get('ORM_HOST'),
        port: configService.get('ORM_PORT'),
        username: configService.get('ORM_USERNAME'),
        password: configService.get('ORM_PASSWORD'),
        database: configService.get('ORM_DATABASE'),
        entities: [join(__dirname, './entities', '*.{ts,js}')],
        logger: new DatabaseLogger(),
        synchronize: false
      }),
      inject: [ConfigService]
    }),
    TrojanModule,
    LogModule
  ],
  controllers: [],
  providers: []
})
export class AppModule { }
