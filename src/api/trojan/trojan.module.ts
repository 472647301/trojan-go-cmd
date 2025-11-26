import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { TrojanService } from './trojan.service'
import { TrojanController } from '.'
import { ServerEntity } from 'src/entities/server.entity'
import { UserEntity } from 'src/entities/user.entity'

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity, ServerEntity])],
  controllers: [TrojanController],
  providers: [TrojanService]
})
export class TrojanModule {}
