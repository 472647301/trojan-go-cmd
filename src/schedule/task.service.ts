import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import { SchedulerRegistry } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import { join } from 'path'
import { Server } from 'src/entities/server.entity'
import { execSync, runSpawnAndLog } from 'src/utils'
import { Repository } from 'typeorm'
import { CronJob } from 'cron'

@Injectable()
export class TaskService implements OnApplicationBootstrap {
  private readonly logger = new Logger(TaskService.name)

  constructor(
    private schedulerRegistry: SchedulerRegistry,
    @InjectRepository(Server)
    private readonly tServer: Repository<Server>
  ) { }

  async onApplicationBootstrap() {
    await this.initializeDynamicTasks()
  }

  /**
   * 刷新单个定时任务（删除旧的，启动新的）
   */
  async refreshCronJob(id: number) {
    const jobName = `task_server_${id}`;

    // 1. 尝试停止并删除已存在的旧任务
    try {
      const oldJob = this.schedulerRegistry.getCronJob(jobName);
      if (oldJob) {
        await oldJob.stop();
        this.schedulerRegistry.deleteCronJob(jobName);
        this.logger.log(`已停止并移除旧任务: ${jobName}`);
      }
    } catch (e) {
      // 如果任务不存在，getCronJob 会抛错，这里直接忽略即可
    }

    await this.initializeDynamicTasks()
  }

  private async initializeDynamicTasks() {
    const [servers, ip] = await Promise.all([
      this.tServer.findBy({ type: 0 }),
      execSync('curl -sL -4 ip.sb')
    ])
    if (!ip || !servers.length) return
    const item = servers.find(e => e.ip === ip)
    const index = servers.findIndex(e => e.ip === ip)
    if (!item) return
    const jobName = `task_server_${item.id}`

    // 0 10 * * * *  每小时，在第10分钟开始时
    let minute = (index + servers.length) * 3
    if (minute > 59) minute = 59

    const cronExpression = `0 ${minute} * * * *`

    const job = new CronJob(cronExpression, () => {
      this.executeTask()
    })

    // 2. 将任务添加到调度注册表
    this.schedulerRegistry.addCronJob(jobName, job);

    // 3. 启动任务
    job.start();

    this.logger.log(`已为 Server ID: ${item.id} 启动定时任务 [${cronExpression}]`);
  }

  private executeTask() {
    runSpawnAndLog('update-trojan', process.argv[0], [
      join(__dirname, '../scripts/update-trojan.js')
    ])
  }

  // // 每 5 分钟
  // @Cron(CronExpression.EVERY_5_MINUTES)
  // async updateInfo() {
  //   runSpawnAndLog('update-trojan', process.argv[0], [
  //     join(__dirname, '../scripts/update-trojan.js')
  //   ])
  // }
}
