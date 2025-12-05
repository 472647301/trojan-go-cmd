import * as dotenv from 'dotenv'
import { existsSync } from 'fs'
import { join } from 'path'
import { Server } from 'src/entities/server.entity'
import { statusEnum } from 'src/enums'
import { checkSystem, execSync, logError, logInfo } from 'src/utils'
import { DataSource } from 'typeorm'
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
  const domain = await execSync(
    `grep sni ${trojanPath.configFile} | cut -d\" -f4`,
    logInfo,
    logError
  )
  await execSync('systemctl stop trojan-go', logInfo, logError)
  await execSync('rm -rf /etc/trojan-go', logInfo, logError)
  await execSync('rm -rf /usr/bin/trojan-go', logInfo, logError)
  await execSync('systemctl disable trojan-go', logInfo, logError)
  await execSync(
    'rm -rf /etc/systemd/system/trojan-go.service',
    logInfo,
    logError
  )
  const bt = await execSync('which bt 2>/dev/null', logInfo, logError)
  if (bt) {
    await execSync(
      `rm -rf ${trojanPath.btNginx}${domain}.conf`,
      logInfo,
      logError
    )
  } else {
    await execSync('systemctl disable nginx', logInfo, logError)
    await execSync(`${pmt} remove -y nginx`, logInfo, logError)
    if (pmt === 'apt') {
      await execSync(`${pmt} remove -y nginx-common`, logInfo, logError)
    }
    await execSync('rm -rf /etc/nginx/nginx.conf', logInfo, logError)
    if (existsSync('/etc/nginx/nginx.conf.bak')) {
      await execSync('mv /etc/nginx/nginx.conf.bak /etc/nginx/nginx.conf')
    }
    await execSync(
      `rm -rf ${trojanPath.nginxConf}${domain}.conf`,
      logInfo,
      logError
    )
  }
  await execSync('~/.acme.sh/acme.sh --uninstall', logInfo, logError)
  entity.status = statusEnum.NotInstalled
  await db.manager.save(entity)
}

main().finally(() => {
  process.exit()
})
