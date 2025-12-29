import { Body, Controller, Param, Post } from '@nestjs/common'
import { TrojanService } from './trojan.service'
import { TrojanLimitDto, TrojanUserDto } from './trojan.dto'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { ApiResult } from 'src/decorators'

@ApiTags('trojan')
@Controller('trojan')
export class TrojanController {
  constructor(private readonly service: TrojanService) {}

  @Post('install')
  @ApiOperation({ summary: '安装' })
  @ApiResult({ type: String })
  install() {
    return this.service.install()
  }

  @Post('uninstall')
  @ApiOperation({ summary: '卸载' })
  @ApiResult({ type: String })
  uninstall() {
    return this.service.uninstall()
  }

  @Post('start')
  @ApiOperation({ summary: '启动' })
  @ApiResult({ type: String })
  start() {
    return this.service.start()
  }

  @Post('stop')
  @ApiOperation({ summary: '停止' })
  @ApiResult({ type: String })
  stop() {
    return this.service.stop()
  }

  @Post('user/:password')
  @ApiOperation({ summary: '调整用户' })
  @ApiResult({ type: String })
  user(@Param('password') password: string, @Body() body: TrojanUserDto) {
    return this.service.user(password, body)
  }

  @Post('limit/:password')
  @ApiOperation({ summary: '限制用户' })
  @ApiResult({ type: String })
  limit(@Param('password') password: string, @Body() body: TrojanLimitDto) {
    return this.service.limit(password, body)
  }
}
