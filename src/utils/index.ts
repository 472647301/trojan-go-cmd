import { exec } from 'child_process'
import { Request } from 'express'
import * as Log4js from 'log4js'

export function fetchIP(req: Request) {
  let xForwarded = req.headers['x-real-ip'] as string
  if (!xForwarded) {
    xForwarded =
      (req.headers['x-forwarded-for'] as string) || (req.ip as string)
  }
  const arr = xForwarded.split(':')
  return arr[arr.length - 1] || ''
}

export function execSync(
  cmd: string,
  logInfo?: Log4js.Logger,
  logError?: Log4js.Logger
): Promise<string> {
  return new Promise((resolve, reject) => {
    logInfo?.info(`cmd: ${cmd}`)
    exec(cmd, (error, stdout, stderr) => {
      if (error || stderr) {
        reject(error?.message || stderr)
        logError?.error(cmd, error?.message || stderr)
      } else {
        logInfo?.info(`cmd: ${cmd} ${stdout.trim()}`)
        resolve(stdout.trim())
      }
    })
  })
}

export async function checkSystem(
  logInfo?: Log4js.Logger,
  logError?: Log4js.Logger
) {
  const id = await execSync('id -u', logInfo, logError)
  if (id !== '0') throw new Error('请以ROOT身份执行')
  const systemctl = await execSync(
    'which systemctl 2>/dev/null',
    logInfo,
    logError
  )
  if (!systemctl) throw new Error('系统版本过低')
  const yum = await execSync('which yum 2>/dev/null', logInfo, logError)
  if (yum) return 'yum'
  const apt = await execSync('which apt 2>/dev/null', logInfo, logError)
  if (apt) return 'apt'
  throw new Error('不受支持的Linux系统')
}

export function sleep(ms = 2000) {
  return new Promise(resolve => {
    setTimeout(() => resolve(true), ms)
  })
}

export async function to<T, U = Error>(
  promise: Promise<T>,
  errorExt?: object
): Promise<[U, undefined] | [null, T]> {
  return promise
    .then<[null, T]>((data: T) => [null, data])
    .catch<[U, undefined]>((err: U) => {
      if (errorExt) {
        const parsedError = Object.assign({}, err, errorExt)
        return [parsedError, undefined]
      }
      return [err, undefined]
    })
}
