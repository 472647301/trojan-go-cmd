import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { exec } from 'child_process'
import { join } from 'path'
import { ServerEntity } from 'src/entities/server.entity'
import { UserEntity } from 'src/entities/user.entity'
import { statusEnum, statusText } from 'src/enums'
import { checkSystem, createTrojanPwd, execSync, sleep } from 'src/utils'
import { apiUtil } from 'src/utils/api'
import { Logs } from 'src/utils/logger'
import { trojanGoStatus } from 'src/utils/trojan'
import { Repository } from 'typeorm'

@Injectable()
export class ApiService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly tUser: Repository<UserEntity>,
    @InjectRepository(ServerEntity)
    private readonly tServer: Repository<ServerEntity>
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
    const cmd = await checkSystem(Logs.app, Logs.err)
    if (typeof cmd === 'string') return apiUtil.error(cmd)
    const scriptPath = join(__dirname, '../scripts/install.js')
    exec(`node ${scriptPath} ${cmd.pmt} ${entity.id}`)
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
    const cmd = await checkSystem(Logs.app, Logs.err)
    if (typeof cmd === 'string') return apiUtil.error(cmd)
    const scriptPath = join(__dirname, '../scripts/uninstall.js')
    exec(`node ${scriptPath} ${cmd.pmt} ${entity.id}`)
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
    const cmd = await checkSystem(Logs.app, Logs.err)
    if (typeof cmd === 'string') return apiUtil.error(cmd)
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
    const cmd = await checkSystem(Logs.app, Logs.err)
    if (typeof cmd === 'string') return apiUtil.error(cmd)
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

  async user(id: string, action: 'add' | 'del') {
    const user = await this.tUser.findOneBy({
      id: Number(id)
    })
    if (!user) return apiUtil.error('用户不存在')
    if (!user.enable) return apiUtil.error('用户被禁用')
    const entity = await this.tServer.findOneBy({
      id: user.serverId
    })
    if (!entity) return apiUtil.error('资源不存在')
    if (entity.status !== statusEnum.Started) {
      return apiUtil.error(`当前服务器-${statusText[entity.status]}`)
    }
    const cmd = await checkSystem(Logs.app, Logs.err)
    if (typeof cmd === 'string') return apiUtil.error(cmd)
    const trojanStatus = await trojanGoStatus(Logs.app, Logs.err)
    if (trojanStatus !== statusEnum.Started) {
      return apiUtil.error(`当前服务器-${statusText[entity.status]}`)
    }
    const pwd = createTrojanPwd(user.username)
    if (action === 'del') {
      const res = await execSync(
        `trojan-go -api set -delete-profile -target-password ${pwd}`,
        Logs.app,
        Logs.err
      )
      if (res !== 'Done') {
        return apiUtil.error(res)
      }
      user.serverHash = null
      await this.tUser.save(user)
      return apiUtil.data({ id: user.id })
    }
    const res = await execSync(
      `trojan-go -api set -add-profile -target-password ${pwd}`,
      Logs.app,
      Logs.err
    )
    if (res !== 'Done') {
      return apiUtil.error(res)
    }
    const info = await execSync(
      `trojan-go -api get -target-password ${pwd}`,
      Logs.app,
      Logs.err
    )
    try {
      const json = JSON.parse(info) as { user: { hash: string } }
      user.serverHash = json.user.hash
      await this.tUser.save(user)
      return apiUtil.data({})
    } catch (e) {
      return apiUtil.error(e)
    }
  }
}
