import { Injectable } from '@nestjs/common'
import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { apiUtil } from 'src/utils/api'
import { LogPageDto } from './log.dto'
import { parseLogLine } from 'src/utils/logger'

const logDir = join(__dirname, '../../../logs')

@Injectable()
export class LogService {
  async pages(body: LogPageDto) {
    // 1. 获取和校验分页参数
    // 默认第一页，每页 100 条
    const page = body.page || 1
    const pageSize = body.pageSize || 100
    if (!existsSync(join(logDir, body.filename))) {
      return apiUtil.error('log file not found')
    }
    const data = readFileSync(join(logDir, body.filename), 'utf-8')
    let allLines = data.split('\n')
    // 移除文件末尾可能的空行
    if (allLines[allLines.length - 1] === '') {
      allLines.pop()
    }

    // ⚠️ 核心逻辑：倒序处理，让前端第一页获取到最新的日志
    // 将日志行倒序排列，使最新的日志在数组的前面
    const reversedLines = allLines.reverse()

    // 2. 计算分页的起始和结束索引
    const startIndex = (page - 1) * pageSize
    const endIndex = startIndex + pageSize

    // 3. 截取当前页的日志行
    const pagedLines = reversedLines.slice(startIndex, endIndex)

    // 4. 解析日志行并过滤无效行
    const structuredLogs = pagedLines.map(line => parseLogLine(line))

    return apiUtil.page(
      structuredLogs.filter(log => log !== null),
      reversedLines.length
    )
  }

  async files() {
    const res = readdirSync(logDir, {
      withFileTypes: true
    })
    const files = res.filter(
      dirent => dirent.isFile() && dirent.name.endsWith('.log')
    )
    return apiUtil.data(files.map(dirent => dirent.name))
  }
}
