import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { TrojanService } from './trojan.service'
import { TrojanController } from '.'
import { Server } from 'src/entities/server.entity'
import { UserServer } from 'src/entities/user.server.entity'

@Module({
  imports: [TypeOrmModule.forFeature([UserServer, Server])],
  controllers: [TrojanController],
  providers: [TrojanService]
})
export class TrojanModule {}
