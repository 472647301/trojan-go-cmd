import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { join } from 'path'
import { Server } from 'src/entities/server.entity'
import { statusEnum, statusText } from 'src/enums'
import { execSync, runSpawnAndLog, sleep, to } from 'src/utils'
import { apiUtil } from 'src/utils/api'
import { Repository } from 'typeorm'
import { TrojanLimitDto, TrojanUserDto, UserAction } from './trojan.dto'
import { configTrojanJson, fetchTrojanStatus } from 'src/utils/trojan'
import { startNginx, stopNginx } from 'src/utils/trojan'
import { existsSync, readFileSync, writeFileSync } from 'fs'

@Injectable()
export class TrojanService {
  constructor(
    @InjectRepository(Server)
    private readonly tServer: Repository<Server>
  ) {}

  private async updateTrojan(isInstall?: boolean) {
    if (isInstall && existsSync('/usr/share/nginx/html/index.html')) {
      const html = readFileSync(join(__dirname, '../../../html/index.html'))
      writeFileSync('/usr/share/nginx/html/index.html', html, {
        encoding: 'utf-8'
      })
    }
    runSpawnAndLog('update-trojan', process.argv[0], [
      join(__dirname, '../../scripts/update-trojan.js')
    ])
  }

  async install() {
    const ip = await execSync('curl -sL -4 ip.sb')
    if (!ip) return apiUtil.error('本机IP获取失败')
    const entity = await this.tServer.findOneBy({
      ip: ip,
      enable: 1
    })
    if (!entity) return apiUtil.error('资源不存在')
    if (!entity.port) return apiUtil.error('未配置端口')
    if (!entity.domain) return apiUtil.error('未配置域名')
    if (entity.status !== statusEnum.NotInstalled) {
      return apiUtil.error(`当前服务器-${statusText[entity.status]}`)
    }
    // 配置 trojan
    configTrojanJson(ip, entity.port, entity.domain)
    runSpawnAndLog(
      `install-${entity.domain.replaceAll('.', '-')}`,
      'bash',
      [join(__dirname, '../../../bin/install.sh')],
      () => this.updateTrojan(true)
    )
    entity.status = statusEnum.InstallationInProgress
    await this.tServer.save(entity)
    return apiUtil.data(`${entity.id}`)
  }

  async uninstall() {
    const ip = await execSync('curl -sL -4 ip.sb')
    if (!ip) return apiUtil.error('本机IP获取失败')
    const entity = await this.tServer.findOneBy({
      ip: ip,
      enable: 1
    })
    if (!entity) return apiUtil.error('资源不存在')
    if (![statusEnum.NotStarted, statusEnum.Started].includes(entity.status)) {
      return apiUtil.error(`当前服务器-${statusText[entity.status]}`)
    }
    runSpawnAndLog(
      `uninstall-${entity.domain.replaceAll('.', '-')}`,
      'bash',
      [join(__dirname, '../../../bin/uninstall.sh')],
      () => this.updateTrojan()
    )
    entity.status = statusEnum.Uninstalling
    await this.tServer.save(entity)
    return apiUtil.data(`${entity.id}`)
  }

  async start() {
    const ip = await execSync('curl -sL -4 ip.sb')
    if (!ip) return apiUtil.error('本机IP获取失败')
    const entity = await this.tServer.findOneBy({
      ip: ip,
      enable: 1
    })
    if (!entity) return apiUtil.error('资源不存在')
    if (entity.status !== statusEnum.NotStarted) {
      return apiUtil.error(`当前服务器-${statusText[entity.status]}`)
    }
    const trojanStatus = await fetchTrojanStatus(entity.port)
    if (trojanStatus !== statusEnum.NotStarted) {
      return apiUtil.error(`当前服务器-${statusText[entity.status]}`)
    }
    const [, bt] = await to(execSync('which bt 2>/dev/null'))
    await stopNginx(!!bt)
    await startNginx(!!bt)
    await execSync('systemctl restart trojan-go')
    await sleep()
    const res = await fetchTrojanStatus(entity.port)
    if (res !== statusEnum.Started) {
      return apiUtil.error(`当前服务器-${statusText[entity.status]}`)
    }
    entity.status = statusEnum.Started
    await this.tServer.save(entity)
    return apiUtil.data(`${entity.id}`)
  }

  async stop() {
    const ip = await execSync('curl -sL -4 ip.sb')
    if (!ip) return apiUtil.error('本机IP获取失败')
    const entity = await this.tServer.findOneBy({
      ip: ip,
      enable: 1
    })
    if (!entity) return apiUtil.error('资源不存在')
    if (entity.status !== statusEnum.Started) {
      return apiUtil.error(`当前服务器-${statusText[entity.status]}`)
    }
    const trojanStatus = await fetchTrojanStatus(entity.port)
    if (trojanStatus !== statusEnum.Started) {
      return apiUtil.error(`当前服务器-${statusText[entity.status]}`)
    }
    const [, bt] = await to(execSync('which bt 2>/dev/null'))
    await stopNginx(!!bt)
    await execSync('systemctl stop trojan-go')
    entity.status = statusEnum.NotStarted
    await this.tServer.save(entity)
    if (bt) await startNginx(true)
    return apiUtil.data(`${entity.id}`)
  }

  async user(password: string, body: TrojanUserDto) {
    if (body.action === UserAction.del) {
      const res = await execSync(
        `trojan-go -api set -delete-profile -target-password ${password}`
      )
      if (res !== 'Done') {
        return apiUtil.error(res)
      }
      return apiUtil.data('success')
    }
    if (body.action === UserAction.add) {
      const res = await execSync(
        `trojan-go -api set -add-profile -target-password ${password}`
      )
      if (res !== 'Done') {
        return apiUtil.error(res)
      }
    }
    const info = await execSync(
      `trojan-go -api get -target-password ${password}`
    )
    const item = JSON.parse(info) as ItemT
    return apiUtil.data(item.status?.user?.hash)
  }

  async limit(password: string, body: TrojanLimitDto) {
    const res = await execSync(
      `trojan-go -api-addr 127.0.0.1:10000 -api set -modify-profile -target-password ${password} -ip-limit ${body.ip} -upload-speed-limit ${body.upload} -download-speed-limit ${body.download}`
    )
    if (res !== 'Done') {
      return apiUtil.error(res)
    }
    return apiUtil.data('success')
  }
}

interface ItemT {
  status: {
    traffic_total?: {
      upload_traffic?: number
      download_traffic?: number
    }
    speed_current?: {
      upload_speed?: number
      download_speed?: number
    }
    speed_limit?: {
      upload_speed?: number
      download_speed?: number
    }
    user?: { hash?: string }
    ip_limit?: number
  }
}
