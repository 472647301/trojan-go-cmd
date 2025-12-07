import { spawnSync } from 'child_process'
import * as dotenv from 'dotenv'
import { join } from 'path'
import { Server } from 'src/entities/server.entity'
import { statusEnum } from 'src/enums'
import { execSync, logError, to } from 'src/utils'
import { startNginx, stopNginx } from 'src/utils/trojan'
import { DataSource } from 'typeorm'

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
  const [, bt] = await to(execSync('which bt 2>/dev/null'))
  await stopNginx(!!bt)
  const result = spawnSync(
    'bash',
    [join(__dirname, '../../bin/uninstall.sh')],
    { encoding: 'utf8' }
  )
  if (result.stdout) console.log('STDOUT:', result.stdout)
  if (result.stderr) console.error('STDERR:', result.stderr)
  if (result.error) console.error('Execution Error:', result.error.message)
  if (bt) await startNginx(true)
  entity.status = statusEnum.NotInstalled
  await db.manager.save(entity)
}

main().finally(() => {
  process.exit()
})
