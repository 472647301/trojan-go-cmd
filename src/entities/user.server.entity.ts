import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'
import { UpdateDateColumn, CreateDateColumn } from 'typeorm'
import { ManyToOne, JoinColumn } from 'typeorm'
import { Server } from './server.entity'

@Entity('user_servers')
export class UserServer {
  @PrimaryGeneratedColumn({
    type: 'int',
    name: 'id'
  })
  id: number

  /**
   * 节点密码
   * 每次登录会随机生成并移除旧的
   */
  @Column('varchar', {
    name: 'password',
    comment: '节点密码',
    length: 255
  })
  password: string

  @Column('varchar', {
    name: 'hash',
    comment: '节点HASH密码',
    nullable: true,
    length: 255
  })
  hash: string | null

  @Column('varchar', {
    name: 'domain',
    comment: '域名',
    length: 255
  })
  domain: string

  @Column('int', {
    name: 'port',
    comment: '端口'
  })
  port: number

  @Column('varchar', {
    name: 'platform',
    comment: '平台标识',
    length: 255
  })
  platform: string

  @Column('int', {
    name: 'user_id',
    comment: '用户ID'
  })
  userId: number

  @Column('int', {
    name: 'server_id',
    comment: '服务器ID'
  })
  serverId: number

  @Column('int', {
    name: 'ip_limit',
    comment: '最大IP限制',
    default: () => '0'
  })
  ipLimit: number

  @Column('bigint', {
    name: 'upload_traffic',
    comment: '总上传流量',
    default: () => '0'
  })
  uploadTraffic: number

  @Column('bigint', {
    name: 'download_traffic',
    comment: '总下载流量',
    default: () => '0'
  })
  downloadTraffic: number

  @Column('int', {
    name: 'upload_speed',
    comment: '上传速度',
    default: () => '0'
  })
  uploadSpeed: number

  @Column('int', {
    name: 'download_speed',
    comment: '下载速度',
    default: () => '0'
  })
  downloadSpeed: number

  @Column('int', {
    name: 'upload_limit',
    comment: '上传限速',
    default: () => '0'
  })
  uploadLimit: number

  @Column('int', {
    name: 'download_limit',
    comment: '下载限速',
    default: () => '0'
  })
  downloadLimit: number

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

  @ManyToOne(() => Server, server => server.userServers)
  @JoinColumn({ name: 'server_id' })
  server: Server
}
