import { Injectable } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { join } from 'path'
import { runScriptAndLogSpawn } from 'src/utils'

@Injectable()
export class TaskTrojanService {
  // 每 5 分钟
  @Cron(CronExpression.EVERY_5_MINUTES)
  async updateInfo() {
    runScriptAndLogSpawn('update-info', process.argv[0], [
      join(__dirname, '../scripts/update-info.js')
    ])
  }
}
