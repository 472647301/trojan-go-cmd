import * as dotenv from 'dotenv'
import { existsSync } from 'fs'
import { join } from 'path'
import { ServerEntity } from 'src/entities/server.entity'
import { statusEnum } from 'src/enums'
import { checkSystem, execSync } from 'src/utils'
import { DataSource } from 'typeorm'
import * as Log4js from 'log4js'
import { trojanPath } from 'src/utils/trojan'

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
  const entity = await db.manager.findOneBy(ServerEntity, {
    ip: ip,
    enable: 1
  })
  if (!entity) return
  Log4js.configure({
    appenders: {
      app: {
        type: 'dateFile',
        filename: `logs/${entity.domain}-uninstall.log`
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
  const domain = await execSync(
    `grep sni ${trojanPath.configFile} | cut -d\" -f4`,
    logger,
    logger
  )
  await execSync('systemctl stop trojan-go', logger, logger)
  await execSync('rm -rf /etc/trojan-go', logger, logger)
  await execSync('rm -rf /usr/bin/trojan-go', logger, logger)
  await execSync('systemctl disable trojan-go', logger, logger)
  await execSync('rm -rf /etc/systemd/system/trojan-go.service', logger, logger)
  const bt = await execSync('which bt 2>/dev/null', logger, logger)
  if (bt) {
    await execSync(`rm -rf ${trojanPath.btNginx}${domain}.conf`, logger, logger)
  } else {
    await execSync('systemctl disable nginx', logger, logger)
    await execSync(`${pmt} remove -y nginx`, logger, logger)
    if (pmt === 'apt') {
      await execSync(`${pmt} remove -y nginx-common`, logger, logger)
    }
    await execSync('rm -rf /etc/nginx/nginx.conf', logger, logger)
    if (existsSync('/etc/nginx/nginx.conf.bak')) {
      await execSync('mv /etc/nginx/nginx.conf.bak /etc/nginx/nginx.conf')
    }
    await execSync(
      `rm -rf ${trojanPath.nginxConf}${domain}.conf`,
      logger,
      logger
    )
  }
  await execSync('~/.acme.sh/acme.sh --uninstall', logger, logger)
  entity.status = statusEnum.NotInstalled
  await db.manager.save(entity)
}

main().finally(() => {
  process.exit()
})
