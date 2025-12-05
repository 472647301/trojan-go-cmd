import { Server } from 'src/entities/server.entity'
import { checkSystem, execSync, logError, logInfo, sleep } from 'src/utils'
import { bbrReboot, configNginx, configTrojan } from 'src/utils/trojan'
import { downloadTrojan, installBBR, installNginx } from 'src/utils/trojan'
import { installTrojan, obtainCertificate, setFirewall } from 'src/utils/trojan'
import { startNginx, stopNginx, trojanGoStatus } from 'src/utils/trojan'
import { UserServer } from 'src/entities/user.server.entity'
import { statusEnum } from 'src/enums'
import { DataSource } from 'typeorm'
import * as dotenv from 'dotenv'
import { join } from 'path'

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
  const pmt = await checkSystem(logInfo, logError)
  await execSync(`${pmt} clean all`, logInfo, logError)
  if (pmt === 'apt') {
    await execSync(`${pmt} update`, logInfo, logError)
  }
  await execSync(
    `${pmt} install -y wget vim unzip tar gcc openssl`,
    logInfo,
    logError
  )
  await execSync(`${pmt} install -y net-tools`, logInfo, logError)
  if (pmt === 'apt') {
    await execSync(`${pmt} libssl-dev g++`, logInfo, logError)
  }
  const unzip = await execSync('which unzip 2>/dev/null', logInfo, logError)
  if (unzip.indexOf('unzip') === -1) {
    logError('Install unzip error')
    return
  }
  const bt = await execSync('which bt 2>/dev/null', logInfo, logError)
  // 安装nginx
  await installNginx(!!bt, pmt, logInfo, logError)
  // 设置防火墙
  await setFirewall(entity.port, logInfo, logError)
  // 获取证书
  if (!bt) await obtainCertificate(pmt, entity.domain, logInfo, logError)
  // 配置 nginx
  await configNginx(!!bt, entity.domain, logInfo, logError)
  // 下载 trojan 文件
  await downloadTrojan(logInfo, logError)
  // 安装 trojan
  await installTrojan(logInfo, logError)
  const userServerList = await db.manager.findBy(UserServer, {
    serverId: entity.id
  })
  const pwds = userServerList.map(e => e.password)
  // 配置 trojan
  await configTrojan(!!bt, entity.port, entity.domain, pwds, logInfo, logError)
  if (entity.bbr) {
    await installBBR(pmt, logInfo, logError)
  }
  await stopNginx(!!bt, logInfo, logError)
  await startNginx(!!bt, logInfo, logError)
  await execSync('systemctl restart trojan-go', logInfo, logError)
  await sleep()
  const status = await trojanGoStatus(logInfo, logError)
  if (status === statusEnum.Started) {
    for (const pwd of pwds) {
      const userServer = userServerList.find(u => {
        return u.password === pwd
      })
      if (!userServer) continue
      try {
        const info = await execSync(
          `trojan-go -api get -target-password ${pwd}`,
          logInfo,
          logError
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
  if (entity.bbr) {
    await bbrReboot(logInfo, logError)
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
