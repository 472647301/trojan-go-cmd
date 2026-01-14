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
  const [, listContent] = await to(
    execSync('trojan-go -api-addr 127.0.0.1:10000 -api list')
  )
  if (!listContent) {
    logError('用户列表读取失败')
    return
  }
  const list = JSON.parse(listContent) as ItemT[]
  if (entity.status === statusEnum.InstallationInProgress) {
    entity.startTime = new Date()
  }
  let ipLimit = 0
  let uploadTraffic = 0
  let downloadTraffic = 0
  for (const item of list) {
    ipLimit += item.status?.ip_limit ?? 0
    uploadTraffic += item.status?.traffic_total?.upload_traffic ?? 0
    downloadTraffic += item.status?.traffic_total?.download_traffic ?? 0
  }
  entity.status = status
  entity.ipLimit = ipLimit
  entity.uploadTraffic = uploadTraffic
  entity.downloadTraffic = downloadTraffic
  entity.online = list.length
  await db.manager.save(entity)

  const newUserServerList: UserServer[] = []
  const userServerList = await db.manager.findBy(UserServer, {
    serverId: entity.id
  })
  for (const uServer of userServerList) {
    const temp = list.find(e => {
      return e.status?.user?.hash === uServer.hash
    })
    if (uServer.hash && temp) {
      uServer.ipLimit = temp.status?.ip_limit ?? 0
      uServer.uploadTraffic = temp.status?.traffic_total?.upload_traffic ?? 0
      uServer.downloadTraffic = temp.status?.traffic_total?.download_traffic ?? 0
      uServer.downloadSpeed = temp.status?.speed_current?.download_speed ?? 0
      uServer.uploadSpeed = temp.status?.speed_current?.upload_speed ?? 0
      uServer.downloadLimit = temp.status?.speed_limit?.download_speed ?? 0
      uServer.uploadLimit = temp.status?.speed_limit?.upload_speed ?? 0
      uServer.hash = temp.status?.user?.hash ?? null
      newUserServerList.push(uServer)
    } else {
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
  }
  await db.manager.save(newUserServerList)
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
