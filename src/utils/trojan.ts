import { statusEnum } from 'src/enums'
import { existsSync, writeFileSync } from 'fs'
import { nginxConfText, trojanConfigJson } from 'src/config'
import { nginxServerConfText } from 'src/config'
import { execSync, to } from '.'
import { join } from 'path'

export const trojanPath = {
  /** 主目录 */
  root: '/etc/trojan-go',
  /** 配置文件路径 */
  configFile: '/etc/trojan-go/config.json',
  /** nginx 路径 */
  nginxConf: '/etc/nginx/conf.d/'
}

export async function startNginx(bt: boolean) {
  await execSync(bt ? '/etc/init.d/nginx start' : 'systemctl start nginx')
}

export async function stopNginx(bt: boolean) {
  await execSync(bt ? '/etc/init.d/nginx stop' : 'systemctl stop nginx')
}

export async function trojanGoStatus(): Promise<statusEnum> {
  const tCmd = await execSync('command -v trojan-go')
  if (!tCmd) return statusEnum.NotInstalled
  if (!existsSync(trojanPath.configFile)) return statusEnum.NotInstalled
  const port = await execSync(
    `grep local_port ${trojanPath.configFile} | cut -d: -f2 | tr -d \",' '`
  )
  const res = await execSync(`ss -ntlp | grep ${port} | grep trojan-go`)
  return res ? statusEnum.Started : statusEnum.NotStarted
}

// 配置 nginx
export async function configNginx(bt: boolean, domain: string) {
  if (bt) {
    if (!existsSync(`/www/server/panel/vhost/nginx/${domain}.conf`)) {
      throw new Error(`please add ${domain} to the bt panel and enable ssl`)
    }
  } else {
    if (!existsSync('/etc/nginx/nginx.conf.bak')) {
      await to(execSync('mv /etc/nginx/nginx.conf /etc/nginx/nginx.conf.bak'))
    }
    const [, res] = await to(execSync('id nginx 2>/dev/null'))
    let nginxText = nginxConfText()
    nginxText = nginxText.replace(
      '{{user}}',
      res !== '0' ? 'www-data' : 'nginx'
    )
    writeFileSync('/etc/nginx/nginx.conf', nginxText, {
      encoding: 'utf-8'
    })

    let serverText = nginxServerConfText()
    serverText = serverText.replace('{{server_name}}', domain)
    serverText = serverText.replace('{{root}}', join(__dirname, '../../html'))
    writeFileSync(join(trojanPath.nginxConf, `${domain}.conf`), serverText, {
      encoding: 'utf-8'
    })
  }
}

// 配置 trojan
export async function configTrojan(
  bt: boolean,
  port: number,
  domain: string,
  passwords: string[]
) {
  await to(execSync(`mkdir -p ${trojanPath.root}`))
  const config: typeof trojanConfigJson = JSON.parse(
    JSON.stringify(trojanConfigJson)
  )
  config.local_port = port
  config.password = ['123456AAaa'].concat(passwords)
  config.ssl.sni = domain
  if (bt) {
    // /www/server/panel/vhost/cert/ota.byronzhu.cn/fullchain.pem
    if (!existsSync(`/www/server/panel/vhost/cert/${domain}/fullchain.pem`)) {
      throw new Error(
        `please configure the ${domain} certificate in the bt panel`
      )
    }
    config.ssl.key = `/www/server/panel/vhost/cert/${domain}/privkey.pem`
    config.ssl.cert = `/www/server/panel/vhost/cert/${domain}/fullchain.pem`
  } else {
    config.ssl.key = `${trojanPath.root}/${domain}.key`
    config.ssl.cert = `${trojanPath.root}/${domain}.pem`
  }

  writeFileSync(trojanPath.configFile, JSON.stringify(config, null, '\t'), {
    encoding: 'utf-8'
  })
}
