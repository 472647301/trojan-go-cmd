import * as dotenv from 'dotenv'
import { join } from 'path'
import { ServerEntity } from 'src/entities/server.entity'
import { createTrojanPwd, execSync, sleep } from 'src/utils'
import { DataSource } from 'typeorm'
import * as Log4js from 'log4js'
import { bbrReboot, configNginx, configTrojan } from 'src/utils/trojan'
import { downloadTrojan, installBBR, installNginx } from 'src/utils/trojan'
import { installTrojan, obtainCertificate, setFirewall } from 'src/utils/trojan'
import { startNginx, stopNginx, trojanGoStatus } from 'src/utils/trojan'
import { UserEntity } from 'src/entities/user.entity'
import { statusEnum } from 'src/enums'

dotenv.config({ path: ['.env'] })

const id = process.argv[1]
const pmt = process.argv[2]

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
  const db = await orm.initialize()
  const entity = await db.manager.findOneBy(ServerEntity, { id: Number(id) })
  if (!entity) return
  Log4js.configure({
    appenders: {
      app: {
        type: 'dateFile',
        filename: `logs/install/${entity.domain}.log`
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
  await obtainCertificate(!!bt, pmt, entity.domain, logger, logger)
  // 配置 nginx
  await configNginx(!!bt, entity.domain, logger, logger)
  // 下载 trojan 文件
  await downloadTrojan(logger, logger)
  // 安装 trojan
  await installTrojan(logger, logger)
  const users = await db.manager.findBy(UserEntity, {
    serverId: entity.id,
    enable: 1
  })
  const pwds = users.map(e => createTrojanPwd(e.username))
  // 配置 trojan
  await configTrojan(entity.port, entity.domain, pwds, logger, logger)
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
      const user = users.find(u => {
        const uPwd = createTrojanPwd(u.username)
        return uPwd === pwd
      })
      if (!user) continue
      const info = await execSync(
        `trojan-go -api get -target-password ${pwd}`,
        logger,
        logger
      )
      try {
        const json = JSON.parse(info) as { user: { hash: string } }
        user.serverHash = json.user.hash
        await this.tUser.save(user)
      } catch (e) {
        logger.error(` >> ${user.username} pwd add fail`)
      }
    }
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
