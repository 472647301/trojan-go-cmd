import * as dotenv from 'dotenv'
import { join } from 'path'
import { Server } from 'src/entities/server.entity'
import { checkSystem, execSync, sleep } from 'src/utils'
import { DataSource } from 'typeorm'
import * as Log4js from 'log4js'
import { bbrReboot, configNginx, configTrojan } from 'src/utils/trojan'
import { downloadTrojan, installBBR, installNginx } from 'src/utils/trojan'
import { installTrojan, obtainCertificate, setFirewall } from 'src/utils/trojan'
import { startNginx, stopNginx, trojanGoStatus } from 'src/utils/trojan'
import { statusEnum } from 'src/enums'
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
    enable: 1
  })
  if (!entity) return
  Log4js.configure({
    appenders: {
      app: {
        type: 'dateFile',
        filename: `logs/${entity.domain}-install.log`
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
  const pmt = await checkSystem(logger, logger)
  await execSync(`${pmt} clean all`, logger, logger)
  if (pmt === 'apt') {
    await execSync(`${pmt} update`, logger, logger)
  }
  await execSync(
    `${pmt} install -y wget vim unzip tar gcc openssl`,
    logger,
    logger
  )
  await execSync(`${pmt} install -y net-tools`, logger, logger)
  if (pmt === 'apt') {
    await execSync(`${pmt} libssl-dev g++`, logger, logger)
  }
  const unzip = await execSync('which unzip 2>/dev/null', logger, logger)
  if (unzip.indexOf('unzip') === -1) {
    logger.error('>> install unzip error')
    return
  }
  const bt = await execSync('which bt 2>/dev/null', logger, logger)
  // 安装nginx
  await installNginx(!!bt, pmt, logger, logger)
  // 设置防火墙
  await setFirewall(entity.port, logger, logger)
  // 获取证书
  if (!bt) await obtainCertificate(pmt, entity.domain, logger, logger)
  // 配置 nginx
  await configNginx(!!bt, entity.domain, logger, logger)
  // 下载 trojan 文件
  await downloadTrojan(logger, logger)
  // 安装 trojan
  await installTrojan(logger, logger)
  const userServerList = await db.manager.findBy(UserServer, {
    serverId: entity.id
  })
  const pwds = userServerList.map(e => e.password)
  // 配置 trojan
  await configTrojan(!!bt, entity.port, entity.domain, pwds, logger, logger)
  if (entity.bbr) {
    await installBBR(pmt, logger, logger)
  }
  await stopNginx(!!bt, logger, logger)
  await startNginx(!!bt, logger, logger)
  await execSync('systemctl restart trojan-go', logger, logger)
  await sleep()
  const status = await trojanGoStatus(logger, logger)
  if (status === statusEnum.Started) {
    for (const pwd of pwds) {
      const userServer = userServerList.find(u => {
        return u.password === pwd
      })
      if (!userServer) continue
      try {
        const info = await execSync(
          `trojan-go -api get -target-password ${pwd}`,
          logger,
          logger
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
        logger.error(` >> ${userServer.password} add fail`)
      }
    }
    entity.startTime = new Date()
  }
  entity.status = status
  await db.manager.save(entity)
  if (entity.bbr) {
    await bbrReboot(logger, logger)
  }
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
