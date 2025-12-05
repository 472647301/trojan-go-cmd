import * as dotenv from 'dotenv'
import { existsSync } from 'fs'
import { join } from 'path'
import { Server } from 'src/entities/server.entity'
import { statusEnum } from 'src/enums'
import { checkSystem, execSync, logError, to } from 'src/utils'
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
  const pmt = await checkSystem()
  const [, domain] = await to(
    execSync(`grep sni ${trojanPath.configFile} | cut -d\" -f4`)
  )
  if (!domain) {
    logError('域名读取失败')
    return
  }
  await to(execSync('systemctl stop trojan-go'))
  await to(execSync('rm -rf /etc/trojan-go'))
  await to(execSync('rm -rf /usr/bin/trojan-go'))
  await to(execSync('systemctl disable trojan-go'))
  await to(execSync('rm -rf /etc/systemd/system/trojan-go.service'))
  const [, bt] = await to(execSync('which bt 2>/dev/null'))
  if (bt) {
    await to(execSync(`rm -rf ${trojanPath.btNginx}${domain}.conf`))
  } else {
    await to(execSync('systemctl disable nginx'))
    await to(execSync(`${pmt} remove -y nginx`))
    if (pmt === 'apt') {
      await to(execSync(`${pmt} remove -y nginx-common`))
    }
    await to(execSync('rm -rf /etc/nginx/nginx.conf'))
    if (existsSync('/etc/nginx/nginx.conf.bak')) {
      await to(execSync('mv /etc/nginx/nginx.conf.bak /etc/nginx/nginx.conf'))
    }
    await to(execSync(`rm -rf ${trojanPath.nginxConf}${domain}.conf`))
  }
  await to(execSync('~/.acme.sh/acme.sh --uninstall'))
  entity.status = statusEnum.NotInstalled
  await db.manager.save(entity)
}

main().finally(() => {
  process.exit()
})
