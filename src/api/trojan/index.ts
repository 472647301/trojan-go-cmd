import { Body, Controller, Param, Post } from '@nestjs/common'
import { TrojanService } from './trojan.service'
import { TrojanItem, TrojanLimitDto, TrojanUserDto } from './trojan.dto'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { ApiResult } from 'src/decorators'

@ApiTags('trojan')
@Controller('trojan')
export class TrojanController {
  constructor(private readonly service: TrojanService) {}

  @Post('install')
  @ApiOperation({ summary: '安装' })
  @ApiResult({ type: TrojanItem })
  install() {
    return this.service.install()
  }

  @Post('uninstall')
  @ApiOperation({ summary: '卸载' })
  @ApiResult({ type: TrojanItem })
  uninstall() {
    return this.service.uninstall()
  }

  @Post('start')
  @ApiOperation({ summary: '启动' })
  @ApiResult({ type: TrojanItem })
  start() {
    return this.service.start()
  }

  @Post('stop')
  @ApiOperation({ summary: '停止' })
  @ApiResult({ type: TrojanItem })
  stop() {
    return this.service.stop()
  }

  @Post('user/:id')
  @ApiOperation({ summary: '调整用户' })
  @ApiResult({ type: TrojanItem })
  user(@Param('id') id: string, @Body() body: TrojanUserDto) {
    return this.service.user(id, body)
  }

  @Post('limit/:id')
  @ApiOperation({ summary: '限制用户' })
  @ApiResult({ type: TrojanItem })
  limit(@Param('id') id: string, @Body() body: TrojanLimitDto) {
    return this.service.limit(id, body)
  }
}
