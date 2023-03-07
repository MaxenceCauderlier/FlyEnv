const { I18nT } = require('./lang/index.js')
const existsSync = require('fs').existsSync
const readFileSync = require('fs').readFileSync
const unlinkSync = require('fs').unlinkSync
const execPromise = require('child-process-promise').exec
const sudo = require('sudo-prompt')

class BaseManager {
  constructor() {
    this._thenSuccess = this._thenSuccess.bind(this)
    this._catchError = this._catchError.bind(this)
    this.type = ''
    this.pidPath = ''
    this.ipcCommand = ''
    this.ipcCommandKey = ''
  }
  exec(commands) {
    this.ipcCommand = commands[0]
    commands.splice(0, 1)
    this.ipcCommandKey = commands[0]
    commands.splice(0, 1)

    let fn = commands[0]
    commands.splice(0, 1)

    sudo.exec(
      "echo 'Request Sudo'",
      {
        name: 'PHPWebStudy'
      },
      (error) => {
        if (error) {
          process.send({
            command: 'application:need-password',
            key: 'application:need-password',
            info: false
          })
          this._processSend({
            code: 1,
            msg: I18nT('fork.needPassWord') + '<br/>'
          })
          return
        }
        if (this[fn]) {
          this[fn](...commands)
        }
      }
    )
  }

  _fixEnv() {
    let optdefault = { env: process.env }
    if (!optdefault.env['PATH']) {
      optdefault.env['PATH'] =
        '/opt:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin'
    } else {
      optdefault.env[
        'PATH'
      ] = `/opt:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:${optdefault.env['PATH']}`
    }
    if (global.Server.Proxy) {
      for (const k in global.Server.Proxy) {
        optdefault.env[k] = global.Server.Proxy[k]
      }
    }
    return optdefault
  }

  _startServer() {}

  _linkVersion(version) {
    return new Promise((resolve) => {
      if (version && version?.bin) {
        try {
          const v = version.bin
            .split(global.Server.BrewCellar + '/')
            .pop()
            ?.split('/')?.[0]
          if (v) {
            const opt = this._fixEnv()
            const command = `brew unlink ${v} && brew link --overwrite --force ${v}`
            execPromise(command, opt)
              .then(() => {
                resolve(true)
              })
              .catch((e) => {
                resolve(e.toString())
              })
          } else {
            resolve(I18nT('fork.versionError'))
          }
        } catch (e) {
          resolve(e.toString())
        }
      } else {
        resolve(I18nT('fork.needSelectVersion'))
      }
    })
  }

  doLinkVersion(version) {
    this._linkVersion(version).then((res) => {
      this._processSend({
        code: typeof res === 'boolean' ? 0 : 1,
        msg: res
      })
    })
  }

  switchVersion(version) {
    this._stopServer()
      .then(() => {
        return this._startServer(version)
      })
      .then(() => {
        return this._linkVersion(version)
      })
      .then(() => {
        this._processSend({
          code: 0,
          msg: 'SUCCESS',
          version
        })
      })
      .catch((code) => {
        let info = code ? code.toString() : I18nT('fork.switchFail')
        this._processSend({
          code: 1,
          msg: info,
          version
        })
      })
  }

  stopService(version) {
    this._stopServer(version).then(this._thenSuccess).catch(this._catchError)
  }

  reloadService() {
    this._reloadServer().then(this._thenSuccess).catch(this._catchError)
  }

  startService(version) {
    this._stopServer(version)
      .then(() => {
        return this._startServer(version)
      })
      .then(this._thenSuccess)
      .catch(this._catchError)
  }

  _stopServer() {
    return new Promise((resolve) => {
      const cleanPid = () => {
        try {
          if (existsSync(this.pidPath)) {
            unlinkSync(this.pidPath)
          }
        } catch (e) {}
      }
      let dis = {
        php: 'php-fpm',
        nginx: 'nginx',
        apache: 'httpd',
        mysql: 'mysqld',
        memcached: 'memcached',
        redis: 'redis-server',
        mongodb: 'mongod'
      }
      let serverName = dis[this.type]
      let command = `ps aux | grep '${serverName}' | awk '{print $2,$11,$12}'`
      console.log('_stopServer command: ', command)
      execPromise(command).then((res) => {
        let pids = res.stdout.trim().split('\n')
        console.log('pids: ', pids)
        let arr = []
        for (let p of pids) {
          if (
            p.indexOf(' grep ') >= 0 ||
            p.indexOf(' /bin/sh -c') >= 0 ||
            p.indexOf('/Contents/MacOS/') >= 0
          ) {
            continue
          }
          arr.push(p.split(' ')[0])
        }
        console.log('pids 0: ', arr)
        if (arr.length === 0) {
          cleanPid()
          resolve(0)
        } else {
          arr = arr.join(' ')
          console.log('pids 1: ', arr)
          let sig = ''
          switch (this.type) {
            case 'mysql':
              sig = '-9'
              break
            case 'mongodb':
              sig = '-2'
              break
            default:
              sig = '-INT'
              break
          }
          sudo.exec(
            `sudo kill ${sig} ${arr}`,
            {
              name: 'PHPWebStudy'
            },
            () => {
              setTimeout(() => {
                cleanPid()
                resolve(0)
              }, 1000)
            }
          )
        }
      })
    })
  }

  _reloadServer() {
    return new Promise((resolve, reject) => {
      console.log('this.pidPath: ', this.pidPath)
      if (existsSync(this.pidPath)) {
        let pid = readFileSync(this.pidPath, 'utf-8')
        let sign =
          this.type === 'apache' || this.type === 'mysql' || this.type === 'nginx'
            ? '-HUP'
            : '-USR2'
        sudo.exec(
          `sudo kill ${sign} ${pid}`,
          {
            name: 'PHPWebStudy'
          },
          (err, stdout, stderr) => {
            if (err) {
              reject(new Error(stderr?.toString() ?? ''))
              return
            }
            setTimeout(() => {
              resolve(0)
            }, 1000)
          }
        )
      } else {
        reject(new Error(I18nT('fork.serviceNoRun')))
      }
    })
  }

  _handleStd(buffer, out) {
    let str = buffer.toString().replace(/\r\n/g, '<br/>').replace(/\n/g, '<br/>')
    out += str
    if (str.endsWith('<br/>') || str.endsWith('%')) {
      this._handlChildOut && this._handlChildOut(out)
      out = out.replace(/ /g, '&ensp;').trim()
      process.send({
        command: this.ipcCommand,
        key: this.ipcCommandKey,
        info: {
          code: 200,
          msg: out
        }
      })
      out = ''
    }
    return out
  }

  _childHandle(child, resolve, reject) {
    let stdout = ''
    let stderr = ''
    let exit = false
    child.stdout.on('data', (data) => {
      stdout = this._handleStd(data, stdout)
    })
    child.stderr.on('data', (err) => {
      stderr = this._handleStd(err, stderr)
    })
    child.on('exit', function (code) {
      console.log('exit: ', code)
      if (exit) return
      exit = true
      if (code === 0) {
        resolve(code)
      } else {
        reject(code)
      }
    })
    child.on('close', function (code) {
      console.log('close: ', code)
      if (exit) return
      exit = true
      if (code === 0) {
        resolve(code)
      } else {
        reject(code)
      }
    })
  }

  _handleLog(info) {
    let str = info.toString().replace(/\r\n/g, '<br/>').replace(/\n/g, '<br/>')
    str += '<br/>'
    str = str.replace(/ /g, '&ensp;')
    process.send({
      command: this.ipcCommand,
      key: this.ipcCommandKey,
      info: {
        code: 200,
        msg: str
      }
    })
  }

  _processSend(info) {
    process.send({
      command: this.ipcCommand,
      key: this.ipcCommandKey,
      info: info
    })
  }

  _thenSuccess() {
    this._processSend({
      code: 0,
      msg: 'SUCCESS'
    })
  }

  _catchError(error) {
    this._processSend({
      code: 1,
      msg: `${error}`
    })
  }
}
module.exports = BaseManager
