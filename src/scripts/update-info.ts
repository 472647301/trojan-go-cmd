import * as dotenv from 'dotenv'
import { join } from 'path'
import { Server } from 'src/entities/server.entity'
import { execSync } from 'src/utils'
import { DataSource } from 'typeorm'
import * as Log4js from 'log4js'
import { statusEnum } from 'src/enums'
import { trojanGoStatus } from 'src/utils/trojan'
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
  const ip = await execSync('curl -sL -4 ip.sb')
  if (!ip) return
  const db = await orm.initialize()
  const entity = await db.manager.findOneBy(Server, {
    ip: ip,
    enable: 1,
    status: statusEnum.Started
  })
  if (!entity) return
  Log4js.configure({
    appenders: {
      app: {
        type: 'dateFile',
        filename: `logs/${entity.domain}-update-info.log`
      }
    },
    categories: {
      default: {
        level: 'all',
        appenders: ['app']
      }
    }
  })
  const logger = Log4js.getLogger('app')
  const status = await trojanGoStatus(logger, logger)
  if (status !== statusEnum.Started) return
  const userServerList = await db.manager.findBy(UserServer, {
    serverId: entity.id
  })
  const text = await execSync(
    'trojan-go -api-addr 127.0.0.1:10000 -api list',
    logger,
    logger
  )
  let ipLimit = 0
  let uploadTraffic = 0
  let downloadTraffic = 0
  const list = JSON.parse(text) as ItemT[]
  for (const item of list) {
    ipLimit += item.status.ip_limit
    uploadTraffic += item.status.traffic_total.upload_traffic
    downloadTraffic += item.status.traffic_total.download_traffic
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
