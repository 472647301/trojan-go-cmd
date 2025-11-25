import { exec } from 'child_process'
import { createHash } from 'crypto'
import * as Log4js from 'log4js'

const cmd = { pmt: '' }

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
        resolve(stdout)
      }
    })
  })
}

export async function checkSystem(
  logInfo?: Log4js.Logger,
  logError?: Log4js.Logger
) {
  if (cmd.pmt) return cmd
  const id = await execSync('id -u', logInfo, logError)
  if (id !== '0') return '请以ROOT身份执行'
  const systemctl = await execSync(
    'which systemctl 2>/dev/null',
    logInfo,
    logError
  )
  if (!systemctl) return '系统版本过低'
  const yum = await execSync('which yum 2>/dev/null', logInfo, logError)
  if (yum) {
    cmd.pmt = 'yum'
    return cmd
  }
  const apt = await execSync('which apt 2>/dev/null', logInfo, logError)
  if (apt) {
    cmd.pmt = 'apt'
    return cmd
  }
  return '不受支持的Linux系统'
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

export function createTrojanPwd(username: string) {
  return createHash('md5').update(username).digest('hex')
}
