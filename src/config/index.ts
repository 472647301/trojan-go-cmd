import { readFileSync } from 'fs'
import { join } from 'path'

export const trojanConfigJson = {
  run_type: 'server',
  local_addr: '::',
  local_port: 0,
  remote_addr: '127.0.0.1',
  remote_port: 80,
  log_level: 2,
  log_file: '/etc/trojan-go/main.log',
  password: [''],
  ssl: {
    cert: '',
    key: '',
    sni: '',
    alpn: ['http/1.1'],
    session_ticket: true,
    reuse_session: true,
    fallback_addr: '127.0.0.1',
    fallback_port: 80
  },
  tcp: {
    no_delay: true,
    keep_alive: true,
    prefer_ipv4: false
  },
  mux: {
    enabled: false,
    concurrency: 8,
    idle_timeout: 60
  },
  websocket: {
    enabled: false
  },
  mysql: {
    enabled: false
  },
  api: {
    enabled: true,
    api_addr: '127.0.0.1',
    api_port: 10000
  }
}

export const nginxConfText = () =>
  readFileSync(join(__dirname, '../../nginx/nginx.conf'), {
    encoding: 'utf-8'
  }).toString()

export const nginxServerConfText = () =>
  readFileSync(join(__dirname, '../../nginx/server.conf'), {
    encoding: 'utf-8'
  }).toString()
