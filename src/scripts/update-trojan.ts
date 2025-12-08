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

async function addUserServerHash(db: DataSource, serverId: number) {
  const userServerList = await db.manager.findBy(UserServer, {
    serverId: serverId
  })
  for (const user of userServerList) {
    const [err, res] = await to(
      execSync(
        `trojan-go -api set -add-profile -target-password ${user.password}`
      )
    )
    if (res !== 'Done') {
      logError('[AddUserServerHash]: ', err ?? res)
      continue
    }
    try {
      const info = await execSync(
        `trojan-go -api get -target-password ${user.password}`
      )
      const item = JSON.parse(info) as ItemT
      user.hash = item.user.hash
      user.ipLimit = item.status.ip_limit
      user.uploadTraffic = item.status.traffic_total.upload_traffic
      user.downloadTraffic = item.status.traffic_total.download_traffic
      user.downloadSpeed = item.status.speed_current.download_speed
      user.uploadSpeed = item.status.speed_current.upload_speed
      user.downloadLimit = item.status.speed_limit.download_speed
      user.uploadLimit = item.status.speed_limit.upload_speed
      await this.tUserServer.save(user)
    } catch (e) {
      logError('[AddUserServerHash]: ', e)
    }
  }
}

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
    await addUserServerHash(db, entity.id)
  }
  const userServerList = await db.manager.findBy(UserServer, {
    serverId: entity.id
  })
  const [, text] = await to(
    execSync('trojan-go -api-addr 127.0.0.1:10000 -api list')
  )
  if (!text) {
    logError('用户列表读取失败')
    return
  }
  let ipLimit = 0
  let uploadTraffic = 0
  let downloadTraffic = 0
  const list = JSON.parse(text) as ItemT[]
  for (const item of list) {
    ipLimit += item.status.ip_limit
    uploadTraffic += item.status.traffic_total.upload_traffic
    downloadTraffic += item.status.traffic_total.download_traffic
    if (entity.status === statusEnum.InstallationInProgress) continue
    // addUserServerHash 已更新
    const userServer = userServerList.find(e => {
      return e.hash === item.user.hash
    })
    if (!userServer) continue
    userServer.ipLimit = item.status.ip_limit
    userServer.uploadTraffic = item.status.traffic_total.upload_traffic
    userServer.downloadTraffic = item.status.traffic_total.download_traffic
    userServer.downloadSpeed = item.status.speed_current.download_speed
    userServer.uploadSpeed = item.status.speed_current.upload_speed
    userServer.downloadLimit = item.status.speed_limit.download_speed
    userServer.uploadLimit = item.status.speed_limit.upload_speed
    await db.manager.save(userServer)
  }
  entity.ipLimit = ipLimit
  entity.uploadTraffic = uploadTraffic
  entity.downloadTraffic = downloadTraffic
  entity.online = list.length
  entity.status = status
  await db.manager.save(entity)
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
