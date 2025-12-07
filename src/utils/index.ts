import { exec, spawn, spawnSync } from 'child_process'
import dayjs from 'dayjs'
import { Request } from 'express'
import { closeSync, openSync } from 'fs'
import { join } from 'path'

export function fetchIP(req: Request) {
  let xForwarded = req.headers['x-real-ip'] as string
  if (!xForwarded) {
    xForwarded =
      (req.headers['x-forwarded-for'] as string) || (req.ip as string)
  }
  const arr = xForwarded.split(':')
  return arr[arr.length - 1] || ''
}

export function execSync(cmd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    logInfo(`cmd: ${cmd}`)
    exec(cmd, (error, stdout, stderr) => {
      if (error || stderr) {
        reject(error?.message || stderr)
        logError(cmd, error?.message || stderr)
      } else {
        logInfo(`cmd: ${cmd} ${stdout.trim()}`)
        resolve(stdout.trim())
      }
    })
  })
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

export function logInfo(message?: any, ...optionalParams: any[]) {
  console.info(
    `[${dayjs().format('YYYY-MM-DD HH:mm:ss')}] ${message}`,
    ...optionalParams
  )
}

export function logError(message?: any, ...optionalParams: any[]) {
  console.error(
    `[${dayjs().format('YYYY-MM-DD HH:mm:ss')}] ${message}`,
    ...optionalParams
  )
}

export function runScriptAndLogSpawn(scriptPath: string, logName: string) {
  const stdoutLog = openSync(
    join(__dirname, `../../logs/${logName}-stdout.log`),
    'a'
  ) // 'a' means append
  const stderrLog = openSync(
    join(__dirname, `../../logs/${logName}-stderr.log`),
    'a'
  )

  logInfo(`Spawning child process and redirecting output to log files...`)
  const child = spawn(process.argv[0], [scriptPath], {
    // Pipes stdin to parent, stdout to stdoutLog FD, stderr to stderrLog FD
    stdio: ['inherit', stdoutLog, stderrLog]
  })

  child.on('error', err => {
    logError('Failed to start child process:', err)
  })

  child.on('close', code => {
    logInfo(`Child process exited with code ${code}.`)
    // Close file descriptors when done
    closeSync(stdoutLog)
    closeSync(stderrLog)
  })
}
