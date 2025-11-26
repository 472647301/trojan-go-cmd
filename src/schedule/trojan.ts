import { Injectable } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { exec } from 'child_process'
import { join } from 'path'

@Injectable()
export class TaskTrojanService {
  // 每 5 分钟
  @Cron(CronExpression.EVERY_5_MINUTES)
  async updateInfo() {
    exec(`node ${join(__dirname, '../scripts/update-info.js')}`)
  }
}
