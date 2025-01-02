import { join, dirname, basename, isAbsolute } from 'path'
import { existsSync } from 'fs'
import { Base } from './Base'
import { I18nT } from '../lang'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  AppLog,
  execPromise,
  execPromiseRoot,
  versionBinVersion,
  versionFilterSame,
  versionFixed,
  versionInitedApp,
  versionLocalFetch,
  versionSort
} from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { writeFile, readFile, remove, mkdirp, copyFile, readdir } from 'fs-extra'
import { zipUnPack } from '@shared/file'
import TaskQueue from '../TaskQueue'
import { ProcessListSearch } from '../Process'
import { EOL } from 'os'

class Php extends Base {
  constructor() {
    super()
    this.type = 'php'
  }

  init() {
    this.pidPath = join(global.Server.PhpDir!, 'php.pid')
  }

  getIniPath(version: SoftInstalled): ForkPromise<string> {
    return new ForkPromise(async (resolve, reject) => {
      const ini = join(version.path, 'php.ini')
      if (existsSync(ini)) {
        resolve(ini)
        return
      }
      const initIniFile = async (file: string) => {
        let content = await readFile(file, 'utf-8')
        content = content.replace(';extension_dir = "ext"', 'extension_dir = "ext"')
        let dll = join(version.path, 'ext/php_redis.dll')
        if (existsSync(dll)) {
          content = content + `\nextension=php_redis.dll`
        }
        dll = join(version.path, 'ext/php_xdebug.dll')
        if (existsSync(dll)) {
          content = content + `\nzend_extension=php_xdebug.dll`
        }
        dll = join(version.path, 'ext/php_mongodb.dll')
        if (existsSync(dll)) {
          content = content + `\nextension=php_mongodb.dll`
        }
        dll = join(version.path, 'ext/php_memcache.dll')
        if (existsSync(dll)) {
          content = content + `\nextension=php_memcache.dll`
        }
        dll = join(version.path, 'ext/php_pdo_sqlsrv.dll')
        if (existsSync(dll)) {
          content = content + `\nextension=php_pdo_sqlsrv.dll`
        }
        dll = join(version.path, 'ext/php_openssl.dll')
        if (existsSync(dll)) {
          content = content + `\nextension=php_openssl.dll`
        }
        dll = join(version.path, 'ext/php_curl.dll')
        if (existsSync(dll)) {
          content = content + `\nextension=php_curl.dll`
        }
        dll = join(version.path, 'ext/php_gd.dll')
        if (existsSync(dll)) {
          content = content + `\nextension=php_gd.dll`
        }
        dll = join(version.path, 'ext/php_fileinfo.dll')
        if (existsSync(dll)) {
          content = content + `\nextension=php_fileinfo.dll`
        }

        content = content + `\nextension=php_mysqli.dll`
        content = content + `\nextension=php_pdo_mysql.dll`
        content = content + `\nextension=php_pdo_odbc.dll`

        await writeFile(ini, content)
        const iniDefault = join(version.path, 'php.ini.default')
        await writeFile(iniDefault, content)
      }

      const devIni = join(version.path, 'php.ini-development')
      if (existsSync(devIni)) {
        await initIniFile(devIni)
        if (existsSync(ini)) {
          resolve(ini)
          return
        }
      }

      const proIni = join(version.path, 'php.ini-production')
      if (existsSync(proIni)) {
        await initIniFile(proIni)
        if (existsSync(ini)) {
          resolve(ini)
          return
        }
      }

      reject(new Error(I18nT('fork.phpiniNoFound')))
    })
  }

  _stopServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.stopServiceBegin', { service: this.type }))
      })
      const all = await ProcessListSearch(`phpwebstudy.90${version.num}`, false)
      const arr: Array<number> = []
      const fpm: Array<number> = []
      all.forEach((item) => {
        if (item?.CommandLine?.includes('php-cgi-spawner.exe')) {
          fpm.push(item.ProcessId)
        } else {
          arr.push(item.ProcessId)
        }
      })
      arr.unshift(...fpm)
      console.log('php arr: ', arr)
      if (arr.length > 0) {
        const str = arr.map((s) => `/pid ${s}`).join(' ')
        try {
          await execPromiseRoot(`taskkill /f /t ${str}`)
        } catch (e) {}
      }
      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.stopServiceEnd', { service: this.type }))
      })
      resolve({
        'APP-Service-Stop-PID': arr
      })
    })
  }

  #initFPM() {
    return new Promise((resolve) => {
      const fpm = join(global.Server.PhpDir!, 'php-cgi-spawner.exe')
      if (!existsSync(fpm)) {
        zipUnPack(join(global.Server.Static!, `zip/php_cgi_spawner.7z`), global.Server.PhpDir!)
          .then(resolve)
          .catch(resolve)
        return
      }
      resolve(true)
    })
  }

  startService(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      await this.initLocalApp(version, 'php')
      if (!existsSync(version?.bin)) {
        reject(new Error(I18nT('fork.binNoFound')))
        return
      }
      if (!version?.version) {
        reject(new Error(I18nT('fork.versionNoFound')))
        return
      }
      try {
        await this._stopServer(version)
        const res = await this._startServer(version).on(on)
        await this._resetEnablePhpConf(version)
        resolve(res)
      } catch (e) {
        reject(e)
      }
    })
  }

  _resetEnablePhpConf(version: SoftInstalled) {
    return new ForkPromise(async (resolve) => {
      const v = version?.version?.split('.')?.slice(0, 2)?.join('') ?? ''
      const confPath = join(global.Server.NginxDir!, 'conf/enable-php.conf')
      await mkdirp(join(global.Server.NginxDir!, 'conf'))
      const tmplPath = join(global.Server.Static!, 'tmpl/enable-php.conf')
      if (existsSync(tmplPath)) {
        let content = await readFile(tmplPath, 'utf-8')
        content = content.replace('##VERSION##', v)
        await writeFile(confPath, content)
      }
      resolve(true)
    })
  }

  _startServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      on({
        'APP-On-Log': AppLog(
          'info',
          I18nT('appLog.startServiceBegin', { service: `${this.type}-${version.version}` })
        )
      })
      await this.#initFPM()
      await this.getIniPath(version)
      if (!existsSync(join(version.path, 'php-cgi-spawner.exe'))) {
        await copyFile(
          join(global.Server.PhpDir!, 'php-cgi-spawner.exe'),
          join(version.path, 'php-cgi-spawner.exe')
        )
      }

      const ini = join(version.path, 'php.ini')
      const runIni = join(version.path, `php.phpwebstudy.90${version.num}.ini`)
      if (existsSync(runIni)) {
        await remove(runIni)
      }
      await copyFile(ini, runIni)

      const commands: string[] = [
        '@echo off',
        'chcp 65001>nul',
        `cd /d "${dirname(version.bin)}"`,
        `start /B ./php-cgi-spawner.exe "php-cgi.exe -c php.phpwebstudy.90${version.num}.ini" 90${version.num} 4 > NUL 2>&1 &`
      ]

      const command = commands.join(EOL)
      console.log('command: ', command)

      const cmdName = `start.cmd`
      const sh = join(global.Server.PhpDir!, cmdName)
      await writeFile(sh, command)

      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.execStartCommand'))
      })
      process.chdir(global.Server.PhpDir!)
      try {
        const res = await execPromiseRoot(
          `powershell.exe -Command "(Start-Process -FilePath ./${cmdName} -PassThru -WindowStyle Hidden).Id"`
        )
        console.log('php start res: ', res.stdout)
        const pid = res.stdout.trim()
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.startServiceSuccess', { pid: pid }))
        })
        resolve({
          'APP-Service-Start-PID': pid
        })
      } catch (e: any) {
        on({
          'APP-On-Log': AppLog(
            'error',
            I18nT('appLog.startServiceFail', {
              error: e,
              service: `${this.type}-${version.version}`
            })
          )
        })
        console.log('-k start err: ', e)
        reject(e)
        return
      }
    })
  }

  doObfuscator(params: any) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const cacheDir = global.Server.Cache!
        const obfuscatorDir = join(cacheDir, 'php-obfuscator')
        await remove(obfuscatorDir)
        const zipFile = join(global.Server.Static!, 'zip/php-obfuscator.zip')
        await zipUnPack(zipFile, obfuscatorDir)
        const bin = join(obfuscatorDir, 'yakpro-po.php')
        let command = ''
        if (params.config) {
          const configFile = join(cacheDir, 'php-obfuscator.cnf')
          await writeFile(configFile, params.config)
          command = `${basename(params.bin)} "${bin}" --config-file "${configFile}" "${params.src}" -o "${params.desc}"`
        } else {
          command = `${basename(params.bin)} "${bin}" "${params.src}" -o "${params.desc}"`
        }
        await execPromise(command, {
          cwd: dirname(params.bin)
        })
        resolve(true)
      } catch (e) {
        reject(e)
      }
    })
  }

  fetchAllOnLineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('php')
        all.forEach((a: any) => {
          const dir = join(global.Server.AppDir!, `php-${a.version}`, 'php.exe')
          const zip = join(global.Server.Cache!, `php-${a.version}.zip`)
          a.appDir = join(global.Server.AppDir!, `php-${a.version}`)
          a.zip = zip
          a.bin = dir
          a.downloaded = existsSync(zip)
          a.installed = existsSync(dir)
        })
        resolve(all)
      } catch (e) {
        resolve([])
      }
    })
  }

  allInstalledVersions(setup: any) {
    return new ForkPromise((resolve) => {
      let versions: SoftInstalled[] = []
      Promise.all([versionLocalFetch(setup?.php?.dirs ?? [], 'php-cgi.exe')])
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) => {
            const command = `${basename(item.bin)} -n -v`
            const reg = /(PHP )(\d+(\.\d+){1,4})( )/g
            return TaskQueue.run(versionBinVersion, item.bin, command, reg)
          })
          return Promise.all(all)
        })
        .then(async (list) => {
          list.forEach((v, i) => {
            const { error, version } = v
            const num = version
              ? Number(versionFixed(version).split('.').slice(0, 2).join(''))
              : null
            Object.assign(versions[i], {
              version: version,
              num,
              enable: version !== null,
              error
            })
          })
          const appInited = await versionInitedApp('php', 'php-cgi.exe')
          versions.push(...appInited.filter((a) => !versions.find((v) => v.bin === a.bin)))
          resolve(versionSort(versions))
        })
        .catch(() => {
          resolve([])
        })
    })
  }

  fetchExtensionDir(version: SoftInstalled) {
    return new ForkPromise(async (resolve) => {
      const ini = await this.getIniPath(version)
      const content: string = await readFile(ini, 'utf-8')

      let dir: string = ''
      const regex: RegExp = /^(?!\s*;)\s*extension_dir\s*=\s*"?([^"\s]+)"?/gm
      let m: any
      while ((m = regex.exec(content)) !== null) {
        console.log(m)
        if (m && m.length > 0) {
          dir = m[1].trim()
        }
      }

      if (!dir) {
        dir = join(dirname(version.bin), 'ext')
      } else if (!isAbsolute(dir)) {
        dir = join(dirname(version.bin), dir)
      }
      if (existsSync(dir)) {
        resolve(dir)
      }
      resolve('')
    })
  }

  fetchLocalExtend(version: SoftInstalled) {
    return new ForkPromise(async (resolve) => {
      const ini = await this.getIniPath(version)
      const content: string = await readFile(ini, 'utf-8')

      let dir: string = ''
      let regex: RegExp = /^(?!\s*;)\s*extension_dir\s*=\s*"?([^"\s]+)"?/gm
      let m: any
      while ((m = regex.exec(content)) !== null) {
        console.log(m)
        if (m && m.length > 0) {
          dir = m[1].trim()
        }
      }

      if (!dir) {
        dir = join(dirname(version.bin), 'ext')
      } else if (!isAbsolute(dir)) {
        dir = join(dirname(version.bin), dir)
      }

      console.log('fetchLocalExtend dir: ', dir)

      const local: any = []
      const used: any = []

      regex = /^(?!\s*;)\s*extension\s*=\s*"?([^"\s]+)"?/gm
      while ((m = regex.exec(content)) !== null) {
        if (m && m.length > 0) {
          const name = m[1].split('.').shift().trim()
          const iniStr = m[0].trim()
          used.push({
            name,
            iniStr
          })
        }
      }

      regex.lastIndex = 0
      regex = /^(?!\s*;)\s*zend_extension\s*=\s*"?([^"\s]+)"?/gm
      while ((m = regex.exec(content)) !== null) {
        if (m && m.length > 0) {
          const name = m[1].split('.').shift().trim()
          const iniStr = m[0].trim()
          used.push({
            name,
            iniStr
          })
        }
      }

      const zend = ['php_opcache', 'php_xdebug']

      if (existsSync(dir)) {
        let all: any = await readdir(dir)
        all = all
          .map((a: string) => a.split('.').shift()!)
          .map((a: string) => {
            return {
              name: a,
              iniStr: zend.includes(a.toLowerCase()) ? `zend_extension=${a}` : `extension=${a}`
            }
          })
        local.push(...all)
      }

      resolve({
        local,
        used,
        dir
      })
    })
  }
}
export default new Php()
