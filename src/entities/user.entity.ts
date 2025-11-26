import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'
import { UpdateDateColumn, CreateDateColumn } from 'typeorm'

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn({
    type: 'int',
    name: 'id'
  })
  id: number

  @Column('varchar', {
    name: 'username',
    comment: '用户名',
    length: 255
  })
  username: string

  @Column('varchar', {
    name: 'server_hash',
    comment: '节点生成的用户密码',
    nullable: true,
    length: 255
  })
  serverHash: string | null

  @Column('int', {
    name: 'server_id',
    comment: '节点ID',
    default: () => '0'
  })
  serverId: number

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

  @Column('tinyint', {
    name: 'enable',
    comment: '0-禁用、1-启用',
    default: () => '1'
  })
  enable: number

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
}
