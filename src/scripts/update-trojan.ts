import * as dotenv from 'dotenv'
import { join } from 'path'
import { Server } from 'src/entities/server.entity'
import { execSync, logError, logInfo, to } from 'src/utils'
import { DataSource } from 'typeorm'
import { statusEnum } from 'src/enums'
import { fetchTrojanStatus } from 'src/utils/trojan'
import { UserServer } from 'src/entities/user.server.entity'

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
  logInfo('Task: update-trojan')
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
  const status = await fetchTrojanStatus(entity.port)
  if (status !== statusEnum.Started) {
    entity.status = status
    await db.manager.save(entity)
    return
  }
  if (entity.status === statusEnum.InstallationInProgress) {
    entity.startTime = new Date()
  }
  const newUserServerList: UserServer[] = []
  const userServerList = await db.manager.findBy(UserServer, {
    serverId: entity.id
  })
  let ipLimit = 0
  let uploadTraffic = 0
  let downloadTraffic = 0
  for (const uServer of userServerList) {
    if (!uServer.password) continue
    if (entity.status === statusEnum.InstallationInProgress) {
      await to(
        execSync(
          `trojan-go -api set -add-profile -target-password ${uServer.password}`
        )
      )
    }
    const [, info] = await to(
      execSync(`trojan-go -api get -target-password ${uServer.password}`)
    )
    if (!info) continue
    const item = JSON.parse(info) as ItemT
    ipLimit += item.status?.ip_limit ?? 0
    uploadTraffic += item.status?.traffic_total?.upload_traffic ?? 0
    downloadTraffic += item.status?.traffic_total?.download_traffic ?? 0

    uServer.ipLimit = item.status?.ip_limit ?? 0
    uServer.uploadTraffic = item.status?.traffic_total?.upload_traffic ?? 0
    uServer.downloadTraffic = item.status?.traffic_total?.download_traffic ?? 0
    uServer.downloadSpeed = item.status?.speed_current?.download_speed ?? 0
    uServer.uploadSpeed = item.status?.speed_current?.upload_speed ?? 0
    uServer.downloadLimit = item.status?.speed_limit?.download_speed ?? 0
    uServer.uploadLimit = item.status?.speed_limit?.upload_speed ?? 0
    uServer.hash = item.status?.user?.hash ?? null
    newUserServerList.push(uServer)
  }
  entity.status = status
  entity.ipLimit = ipLimit
  entity.uploadTraffic = uploadTraffic
  entity.downloadTraffic = downloadTraffic
  entity.online = newUserServerList.length
  await Promise.all([
    db.manager.save(entity),
    db.manager.save(newUserServerList)
  ])
}

main().finally(() => {
  process.exit()
})

interface ItemT {
  status: {
    traffic_total?: {
      upload_traffic?: number
      download_traffic?: number
    }
    speed_current?: {
      upload_speed?: number
      download_speed?: number
    }
    speed_limit?: {
      upload_speed?: number
      download_speed?: number
    }
    user?: { hash?: string }
    ip_limit?: number
  }
}
