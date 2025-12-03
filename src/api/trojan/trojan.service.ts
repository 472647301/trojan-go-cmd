import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { exec } from 'child_process'
import { join } from 'path'
import { Server } from 'src/entities/server.entity'
import { statusEnum, statusText } from 'src/enums'
import { execSync, sleep } from 'src/utils'
import { apiUtil } from 'src/utils/api'
import { Logs } from 'src/utils/logger'
import { trojanGoStatus } from 'src/utils/trojan'
import { Repository } from 'typeorm'
import { TrojanLimitDto, TrojanUserDto, UserAction } from './trojan.dto'
import { UserServer } from 'src/entities/user.server.entity'

@Injectable()
export class TrojanService {
  constructor(
    @InjectRepository(UserServer)
    private readonly tUserServer: Repository<UserServer>,
    @InjectRepository(Server)
    private readonly tServer: Repository<Server>
  ) {}

  async install() {
    const ip = await execSync('curl -sL -4 ip.sb', Logs.app, Logs.err)
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
    exec(`node ${join(__dirname, '../scripts/install.js')}`)
    entity.status = statusEnum.InstallationInProgress
    await this.tServer.save(entity)
    return apiUtil.data({
      id: entity.id,
      status: entity.status
    })
  }

  async uninstall() {
    const ip = await execSync('curl -sL -4 ip.sb', Logs.app, Logs.err)
    if (!ip) return apiUtil.error('本机IP获取失败')
    const entity = await this.tServer.findOneBy({
      ip: ip,
      enable: 1
    })
    if (!entity) return apiUtil.error('资源不存在')
    if (![statusEnum.NotStarted, statusEnum.Started].includes(entity.status)) {
      return apiUtil.error(`当前服务器-${statusText[entity.status]}`)
    }
    exec(`node ${join(__dirname, '../scripts/uninstall.js')}`)
    entity.status = statusEnum.Uninstalling
    await this.tServer.save(entity)
    return apiUtil.data({
      id: entity.id,
      status: entity.status
    })
  }

  async start() {
    const ip = await execSync('curl -sL -4 ip.sb', Logs.app, Logs.err)
    if (!ip) return apiUtil.error('本机IP获取失败')
    const entity = await this.tServer.findOneBy({
      ip: ip,
      enable: 1
    })
    if (!entity) return apiUtil.error('资源不存在')
    if (entity.status !== statusEnum.NotStarted) {
      return apiUtil.error(`当前服务器-${statusText[entity.status]}`)
    }
    const trojanStatus = await trojanGoStatus(Logs.app, Logs.err)
    if (trojanStatus !== statusEnum.NotStarted) {
      return apiUtil.error(`当前服务器-${statusText[entity.status]}`)
    }
    await execSync('systemctl restart trojan-go', Logs.app, Logs.err)
    await sleep()
    const res = await trojanGoStatus(Logs.app, Logs.err)
    if (res !== statusEnum.Started) {
      return apiUtil.error(`当前服务器-${statusText[entity.status]}`)
    }
    entity.status = statusEnum.Started
    await this.tServer.save(entity)
    return apiUtil.data({
      id: entity.id,
      status: statusEnum.Started
    })
  }

  async stop() {
    const ip = await execSync('curl -sL -4 ip.sb', Logs.app, Logs.err)
    if (!ip) return apiUtil.error('本机IP获取失败')
    const entity = await this.tServer.findOneBy({
      ip: ip,
      enable: 1
    })
    if (!entity) return apiUtil.error('资源不存在')
    if (entity.status !== statusEnum.Started) {
      return apiUtil.error(`当前服务器-${statusText[entity.status]}`)
    }
    const trojanStatus = await trojanGoStatus(Logs.app, Logs.err)
    if (trojanStatus !== statusEnum.Started) {
      return apiUtil.error(`当前服务器-${statusText[entity.status]}`)
    }
    await execSync('systemctl stop trojan-go', Logs.app, Logs.err)
    entity.status = statusEnum.NotStarted
    await this.tServer.save(entity)
    return apiUtil.data({
      id: entity.id,
      status: entity.status
    })
  }

  async user(id: string, body: TrojanUserDto) {
    const userServer = await this.tUserServer.findOne({
      where: { id: Number(id) },
      relations: { server: true }
    })
    if (!userServer) return apiUtil.error('资源不存在')
    if (userServer.server.status !== statusEnum.Started) {
      return apiUtil.error(`当前服务器-${statusText[userServer.server.status]}`)
    }
    const trojanStatus = await trojanGoStatus(Logs.app, Logs.err)
    if (trojanStatus !== statusEnum.Started) {
      return apiUtil.error(`当前服务器-${statusText[userServer.server.status]}`)
    }
    if (body.action === UserAction.del) {
      const res = await execSync(
        `trojan-go -api set -delete-profile -target-password ${userServer.password}`,
        Logs.app,
        Logs.err
      )
      if (res !== 'Done') {
        return apiUtil.error(res)
      }
      return apiUtil.data({ id: userServer.id })
    }
    if (body.action === UserAction.add) {
      const res = await execSync(
        `trojan-go -api set -add-profile -target-password ${userServer.password}`,
        Logs.app,
        Logs.err
      )
      if (res !== 'Done') {
        return apiUtil.error(res)
      }
    }
    const info = await execSync(
      `trojan-go -api get -target-password ${userServer.password}`,
      Logs.app,
      Logs.err
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
    return apiUtil.data({ id: userServer.id })
  }

  async limit(id: string, body: TrojanLimitDto) {
    const userServer = await this.tUserServer.findOne({
      where: { id: Number(id) },
      relations: { server: true }
    })
    if (!userServer) return apiUtil.error('资源不存在')
    if (userServer.server.status !== statusEnum.Started) {
      return apiUtil.error(`当前服务器-${statusText[userServer.server.status]}`)
    }
    const trojanStatus = await trojanGoStatus(Logs.app, Logs.err)
    if (trojanStatus !== statusEnum.Started) {
      return apiUtil.error(`当前服务器-${statusText[userServer.server.status]}`)
    }
    const res = await execSync(
      `trojan-go -api-addr 127.0.0.1:10000 -api set -modify-profile -target-password ${userServer.password} \
        -ip-limit ${body.ip} \
        -upload-speed-limit ${body.upload} \
        -download-speed-limit ${body.download} \
      `,
      Logs.app,
      Logs.err
    )
    if (res !== 'Done') {
      return apiUtil.error(res)
    }
    userServer.ipLimit = body.ip
    userServer.uploadLimit = body.upload
    userServer.downloadLimit = body.download
    return apiUtil.data({ id: userServer.id })
  }
}

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
