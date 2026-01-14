import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { TrojanService } from './trojan.service'
import { TrojanController } from '.'
import { Server } from 'src/entities/server.entity'
import { TaskModule } from 'src/schedule/task.module'

@Module({
  imports: [TaskModule, TypeOrmModule.forFeature([Server])],
  controllers: [TrojanController],
  providers: [TrojanService]
})
export class TrojanModule { }
