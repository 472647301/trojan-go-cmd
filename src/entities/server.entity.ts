import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm'
import { UpdateDateColumn, CreateDateColumn } from 'typeorm'
import { UserServer } from './user.server.entity'

@Entity('servers')
export class Server {
  @PrimaryGeneratedColumn({
    type: 'int',
    name: 'id'
  })
  id: number

  @Column('int', {
    name: 'online',
    comment: '在线人数',
    default: () => '0'
  })
  online: number

  @Column('int', {
    name: 'ip_limit',
    comment: '最大IP限制',
    default: () => '0'
  })
  ipLimit: number

  @Column('int', {
    name: 'upload_traffic',
    comment: '总上传流量',
    default: () => '0'
  })
  uploadTraffic: number

  @Column('int', {
    name: 'download_traffic',
    comment: '总下载流量',
    default: () => '0'
  })
  downloadTraffic: number

  @Column('varchar', {
    name: 'ip',
    comment: 'IP',
    unique: true,
    length: 255
  })
  ip: string

  @Column('int', {
    name: 'port',
    comment: 'TROJAN启动端口'
  })
  port: number

  @Column('varchar', {
    name: 'domain',
    comment: '域名',
    length: 255
  })
  domain: string

  @Column('tinyint', {
    name: 'status',
    comment: '0-未安装、1-安装中、2-卸载中、3-已安装未启动、4-已安装已启动',
    default: () => '0'
  })
  status: number

  @Column('tinyint', {
    name: 'type',
    comment: '0-自有服务器、1-外部资源',
    default: () => '0'
  })
  type: number

  @Column('tinyint', {
    name: 'bbr',
    comment: '0-禁用、1-启用',
    default: () => '1'
  })
  bbr: number

  @Column('tinyint', {
    name: 'enable',
    comment: '0-禁用、1-启用',
    default: () => '1'
  })
  enable: number

  @Column('datetime', {
    name: 'start_time',
    comment: '启动时间',
    nullable: true
  })
  startTime: Date | null

  @CreateDateColumn({
    name: 'create_time',
    comment: '创建时间'
  })
  createTime: Date

  @UpdateDateColumn({
    name: 'update_time',
    comment: '更新时间'
  })
  updateTime: Date

  @OneToMany(() => UserServer, userServer => userServer.server)
  userServers: UserServer[]
}
