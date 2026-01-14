import { Module } from '@nestjs/common'
import { TaskService } from './task.service'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Server } from 'src/entities/server.entity'

@Module({
  imports: [TypeOrmModule.forFeature([Server])],
  controllers: [],
  providers: [TaskService],
  exports: [TaskService]
})
export class TaskModule { }
