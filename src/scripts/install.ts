import { Server } from 'src/entities/server.entity'
import { execSync, logError, logInfo, sleep, to } from 'src/utils'
import { startNginx, stopNginx, trojanGoStatus } from 'src/utils/trojan'
import { configNginx, configTrojan } from 'src/utils/trojan'
import { UserServer } from 'src/entities/user.server.entity'
import { statusEnum } from 'src/enums'
import { DataSource } from 'typeorm'
import * as dotenv from 'dotenv'
import { join } from 'path'
import { spawnSync } from 'child_process'

dotenv.config({ path: ['.env'] })

const orm = new DataSource({
  type: 'mysql',
  host: process.env.ORM_HOST,
  port: Number(process.env.ORM_PORT),
  username: process.env.ORM_USERNAME,
  password: process.env.ORM_PASSWORD,
  database: process.env.ORM_DATABASE,
  entities: [join(__dirname, '../entities', '*.{ts,js}')],
  synchronize: false
})

async function main() {
  const ip = await execSync('curl -sL -4 ip.sb')
  if (!ip) {
    logError('IP获取失败')
    return
  }
  const db = await orm.initialize()
  const entity = await db.manager.findOneBy(Server, {
    ip: ip,
    enable: 1
  })
  if (!entity) {
    logError('资源不存在')
    return
  }
  const [, bt] = await to(execSync('which bt 2>/dev/null'))
  const userServerList = await db.manager.findBy(UserServer, {
    serverId: entity.id
  })
  const pwds = userServerList.map(e => e.password)
  // 配置 trojan
  await configTrojan(!!bt, entity.port, entity.domain, pwds)
  try {
    const result = spawnSync(
      'bash',
      [join(__dirname, '../../bin/install.sh')],
      {
        encoding: 'utf8'
      }
    )
    if (result.stdout) logInfo('STDOUT:', result.stdout)
    if (result.stderr) logError('STDERR:', result.stderr)
    if (result.error) logError('Execution Error:', result.error.message)
  } catch (e) {
    logError('Bash Error:', e)
  }
  // 配置 nginx
  await configNginx(!!bt, entity.domain)
  await stopNginx(!!bt)
  await startNginx(!!bt)
  await execSync('systemctl restart trojan-go')
  await sleep()
  const status = await trojanGoStatus()
  if (status === statusEnum.Started) {
    for (const pwd of pwds) {
      const userServer = userServerList.find(u => {
        return u.password === pwd
      })
      if (!userServer) continue
      try {
        const info = await execSync(
          `trojan-go -api get -target-password ${pwd}`
        )
        const item = JSON.parse(info) as ItemT
        userServer.hash = item.user.hash
        userServer.ipLimit = item.status.ip_limit
        userServer.uploadTraffic = item.status.traffic_total.upload_traffic
        userServer.downloadTraffic = item.status.traffic_total.download_traffic
        userServer.downloadSpeed = item.status.speed_current.download_speed
        userServer.uploadSpeed = item.status.speed_current.upload_speed
        userServer.downloadLimit = item.status.speed_limit.download_speed
        userServer.uploadLimit = item.status.speed_limit.upload_speed
        await this.tUserServer.save(userServer)
      } catch (e) {
        logError(`${userServer.password} add fail`)
      }
    }
    entity.startTime = new Date()
  }
  entity.status = status
  await db.manager.save(entity)
  if (!entity.bbr) return
  const bbr = spawnSync('bash', [join(__dirname, '../../bin/installBBR.sh')], {
    encoding: 'utf8'
  })
  if (bbr.stdout) console.log('STDOUT:', bbr.stdout)
  if (bbr.stderr) console.error('STDERR:', bbr.stderr)
  if (bbr.error) console.error('Execution Error:', bbr.error.message)
}

main().finally(() => {
  process.exit()
})

interface ItemT {
  user: { hash: string }
  status: {
    traffic_total: {
      upload_traffic: number
      download_traffic: number
    }
    speed_current: {
      upload_speed: number
      download_speed: number
    }
    speed_limit: {
      upload_speed: number
      download_speed: number
    }
    ip_limit: number
  }
}
