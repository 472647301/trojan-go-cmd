import * as Log4js from 'log4js'
import { Logger as TypeOrmLogger } from 'typeorm'

export const log4jsConfigure = () => {
  const type = { type: 'dateFile', numBackups: 7 }
  const options: Log4js.Configuration = {
    appenders: {
      app: { ...type, filename: 'logs/app.log' },
      err: { ...type, filename: 'logs/err.log' },
      sql: { ...type, filename: 'logs/sql.log' }
    },
    categories: {
      err: { appenders: ['err'], level: 'all' },
      sql: { appenders: ['sql'], level: 'all' },
      default: { appenders: ['app'], level: 'all' }
    }
  }
  return options
}

export const Logs = {
  sql: Log4js.getLogger('sql'),
  err: Log4js.getLogger('err'),
  app: Log4js.getLogger('app')
}

export class DatabaseLogger implements TypeOrmLogger {
  logQuery(query: string, parameters?: unknown[]) {
    Logs.sql.log(query, parameters)
  }

  logQueryError(error: string, query: string, parameters?: unknown[]) {
    Logs.sql.error(error, query, parameters)
  }

  logQuerySlow(time: number, query: string, parameters?: unknown[]) {
    Logs.sql.log(`${time}`, query, parameters)
  }

  logMigration(message: string) {
    Logs.sql.log(message)
  }

  logSchemaBuild(message: string) {
    Logs.sql.log(message)
  }

  log(level: 'log' | 'info' | 'warn', message: string) {
    if (level === 'log') {
      return Logs.sql.log(message)
    }
    if (level === 'info') {
      return Logs.sql.info(message)
    }
    if (level === 'warn') {
      return Logs.sql.warn(message)
    }
    return Logs.sql.debug(message)
  }
}

/**
 * 解析一条 log4js 格式的日志字符串，并将其转换为结构化对象。
 * * @param {string} logLine 单条日志字符串，例如："[2025-11-26 15:30:00.123] [INFO] default - Log content."
 */
export function parseLogLine(logLine: string) {
  if (!logLine || typeof logLine !== 'string') {
    return null
  }

  // 正则表达式说明（假设格式为：[日期时间] [级别] 分类器 - 消息内容）
  // 1. \[(.*?)\]        -> 捕获时间戳 (Timestamp)
  // 2. \s+\[(.*?)\]     -> 捕获日志级别 (Level)
  // 3. \s+(.*?)\s+-\s* -> 捕获分类器/Logger名称 (Category)
  // 4. (.*)             -> 捕获剩余部分作为消息 (Message)
  const logRegex = /^\[(.*?)\]\s+\[(.*?)\]\s+(.*?)\s+-\s*(.*)/

  const match = logLine.match(logRegex)

  if (match) {
    const rawTimestamp = match[1]
    const level = match[2]
    const category = match[3]
    const message = match[4]

    // 尝试将时间戳转换为标准的 Date 对象，方便前端排序
    let timestamp: Date
    try {
      timestamp = new Date(
        rawTimestamp.replace(
          /(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2}\.\d{3})/,
          '$1T$2'
        )
      )
      // 如果解析失败，则保留原始字符串
      if (isNaN(timestamp.getTime())) {
        timestamp = rawTimestamp as unknown as Date
      }
    } catch (e) {
      timestamp = rawTimestamp as unknown as Date
    }

    return {
      timestamp: timestamp,
      level: level.toUpperCase(), // 确保级别大写
      category: category,
      message: message,
      raw: logLine // 保留原始行，以防解析错误
    }
  } else {
    // 如果无法匹配，可能是不完整的行、空行或格式不符
    return {
      timestamp: new Date(),
      level: 'UNKNOWN',
      category: 'N/A',
      message: logLine.trim(),
      raw: logLine
    }
  }
}
