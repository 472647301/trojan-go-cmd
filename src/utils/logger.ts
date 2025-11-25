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
