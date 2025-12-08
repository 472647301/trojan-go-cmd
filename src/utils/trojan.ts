import { statusEnum } from 'src/enums'
import { execSync, to } from '.'
import { writeFileSync } from 'fs'
import { join } from 'path'

export async function startNginx(bt: boolean) {
  await to(execSync(bt ? '/etc/init.d/nginx start' : 'systemctl start nginx'))
}

export async function stopNginx(bt: boolean) {
  await to(execSync(bt ? '/etc/init.d/nginx stop' : 'systemctl stop nginx'))
}

export async function fetchTrojanStatus(port: number): Promise<statusEnum> {
  const [, tCmd] = await to(execSync('command -v trojan-go'))
  if (!tCmd) return statusEnum.NotInstalled
  const res = await execSync(`ss -ntlp | grep ${port} | grep trojan-go`)
  return res ? statusEnum.Started : statusEnum.NotStarted
}

export async function configTrojanJson(
  ip: string,
  port: number,
  domain: string,
  pwds: string[]
) {
  let text = `
  "run_type": "server",
  "local_addr": "::",
  "local_port": ${port},
  "remote_addr": "127.0.0.1",
  "remote_port": 80,
  "password": ${JSON.stringify(pwds)},
  "ssl": {
    "cert": "",
    "key": "",
    "sni": "${domain}",
    "alpn": ["http/1.1"],
    "session_ticket": true,
    "reuse_session": true,
    "fallback_addr": "127.0.0.1",
    "fallback_port": 80
  },
  "tcp": {
    "no_delay": true,
    "keep_alive": true,
    "prefer_ipv4": false
  },
  "mux": {
    "enabled": false,
    "concurrency": 8,
    "idle_timeout": 60
  },
  "websocket": {
    "enabled": false,
    "path": "",
    "host": ""
  },
  "mysql": {
    "enabled": false,
    "server_addr": "localhost",
    "server_port": 3306,
    "database": "",
    "username": "",
    "password": "",
    "check_rate": 60
  }
  `
  writeFileSync(join(__dirname, `../../bin/${ip}.json`), text, {
    encoding: 'utf-8'
  })
}
