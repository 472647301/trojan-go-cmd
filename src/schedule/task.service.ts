import { Injectable } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { join } from 'path'
import { runSpawnAndLog } from 'src/utils'

@Injectable()
export class TaskService {
  // 每 5 分钟
  @Cron(CronExpression.EVERY_5_MINUTES)
  async updateInfo() {
    runSpawnAndLog('update-trojan', process.argv[0], [
      join(__dirname, '../scripts/update-trojan.js')
    ])
  }
}
