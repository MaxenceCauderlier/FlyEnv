import { Base } from './Base'
import { execPromise, execPromiseRoot, fixEnv, spawnPromise } from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { dirname, join } from 'path'
import { compareVersions } from 'compare-versions'
import { exec } from 'child_process'
import { existsSync } from 'fs'
import { mkdirp, readFile, writeFile, readdir } from 'fs-extra'
import { zipUnPack } from '@shared/file'
import axios from 'axios'

class Manager extends Base {
  constructor() {
    super()
  }

  allVersion(tool: 'fnm' | 'nvm') {
    return new ForkPromise(async (resolve) => {
      const url = 'https://nodejs.org/dist/'
      const res = await axios({
        method: 'get',
        url: url
      })
      // console.log('res: ', res)
      const html = res.data
      const regex = /href="v([\d\.]+?)\/"/g
      let result
      let links = []
      while ((result = regex.exec(html)) != null) {
        links.push(result[1].trim())
      }
      console.log('links: ', links)
      links = links
        .filter((s) => Number(s.split('.')[0]) > 7)
        .sort((a, b) => {
          return compareVersions(b, a)
        })
      console.log('links: ', links)
      resolve({
        all: links,
        tool
      })
    })
  }

  localVersion(tool: 'fnm' | 'nvm', dir: string) {
    return new ForkPromise(async (resolve, reject) => {
      let command = ''
      if (tool === 'fnm') {
        command = 'fnm ls'
      } else {
        command = 'nvm ls'
      }
      console.log('localVersion dir:', dir)
      let res: any
      try {
        if (dir && existsSync(dir)) {
          res = await execPromise(`${tool}.exe ls`, {
            cwd: dir
          })
        } else {
          res = await execPromise(command)
        }
        console.log('localVersion: ', res)
        const stdout = res.stdout
        let localVersions: Array<string> = []
        let current = ''
        if (tool === 'fnm') {
          localVersions = stdout.match(/\d+(\.\d+){1,4}/g) ?? []
          const regex = /(\d+(\.\d+){1,4}) default/g
          const arr = regex.exec(stdout)
          if (arr && arr.length > 1) {
            current = arr[1]
          }
        } else {
          const str = stdout
          const ls = str.split(' (Currently using')[0]
          localVersions = ls.match(/\d+(\.\d+){1,4}/g) ?? []
          const reg = /(\d+(\.\d+){1,4}) \(Currently using/g
          const currentArr: any = reg.exec(str)
          if (currentArr?.length > 1) {
            current = currentArr[1]
          } else {
            current = ''
          }
        }
        localVersions?.sort((a, b) => {
          return compareVersions(b, a)
        })
        resolve({
          versions: localVersions,
          current: current,
          tool
        })
      } catch (e) {
        console.log('localVersion err: ', e)
        reject(e)
      }
    })
  }

  versionChange(tool: 'fnm' | 'nvm', select: string, dir: string) {
    return new ForkPromise((resolve, reject) => {
      let command = ''
      if (tool === 'fnm') {
        command = `fnm default ${select}`
      } else {
        command = `nvm use ${select}`
      }
      try {
        exec(
          command,
          {
            env: fixEnv()
          },
          async () => {
            const { current }: any = await this.localVersion(tool, dir)
            if (current === select) {
              resolve(true)
            } else {
              reject(new Error('Fail'))
            }
          }
        )
      } catch (e) {
        console.log('versionChange error: ', e)
        reject(e)
      }
    })
  }

  installNvm(flag: string) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        if (flag === 'nvm') {
          const bin = join(global.Server.AppDir!, 'nvm/nvm.exe')
          if (!existsSync(bin)) {
            await zipUnPack(join(global.Server.Static!, `zip/nvm.7z`), global.Server.AppDir!)
            const installcmd = join(global.Server.AppDir!, 'nvm/install.cmd')
            const nvmDir = join(global.Server.AppDir!, 'nvm')
            const linkDir = join(global.Server.AppDir!, 'nvm/nodejs-link')
            let content = await readFile(installcmd, 'utf-8')
            content = content.replace('##NVM_PATH##', nvmDir).replace('##NVM_SYMLINK##', linkDir)
            await writeFile(installcmd, content)
            process.chdir(nvmDir)
            const res = await execPromiseRoot('install.cmd')
            console.log('installNvm res: ', res)
          }
        } else if (flag === 'fnm') {
          const bin = join(global.Server.AppDir!, 'fnm/fnm.exe')
          if (!existsSync(bin)) {
            await zipUnPack(join(global.Server.Static!, `zip/fnm.7z`), global.Server.AppDir!)
            const installcmd = join(global.Server.AppDir!, 'fnm/install.cmd')
            const nvmDir = join(global.Server.AppDir!, 'fnm')
            let content = await readFile(installcmd, 'utf-8')
            content = content.replace('##FNM_PATH##', nvmDir)
            let profile: any = await execPromise('$profile', { shell: 'powershell.exe' })
            profile = profile.stdout.trim()
            const profile_root = profile.replace('WindowsPowerShell', 'PowerShell')
            await mkdirp(dirname(profile))
            await mkdirp(dirname(profile_root))
            content = content.replace('##PROFILE_ROOT##', profile_root.trim())
            content = content.replace('##PROFILE##', profile.trim())
            await writeFile(installcmd, content)
            process.chdir(nvmDir)
            const res = await execPromiseRoot('install.cmd')
            console.log('installNvm res: ', res)
          }
        }
      } catch (e) {
        reject(e)
        return
      }
      setTimeout(() => {
        resolve(true)
      }, 5000)
    })
  }

  installOrUninstall(
    tool: 'fnm' | 'nvm',
    action: 'install' | 'uninstall',
    version: string,
    dir: string
  ) {
    return new ForkPromise((resolve, reject) => {
      let command = ''
      if (tool === 'fnm') {
        command = `fnm ${action} ${version}`
      } else {
        command = `nvm ${action} ${version}`
      }
      try {
        exec(
          command,
          {
            env: fixEnv()
          },
          async () => {
            const { versions, current }: { versions: Array<string>; current: string } =
              (await this.localVersion(tool, dir)) as any
            if (
              (action === 'install' && versions.includes(version)) ||
              (action === 'uninstall' && !versions.includes(version))
            ) {
              resolve({
                versions,
                current
              })
            } else {
              reject(new Error('Fail'))
            }
          }
        )
      } catch (e) {
        reject(e)
      }
    })
  }

  nvmDir() {
    return new ForkPromise(async (resolve) => {
      const bin: Set<string> = new Set()
      let NVM_HOME = ''
      let FNM_HOME = ''
      try {
        await spawnPromise('cmd.exe', ['/c', 'nvm.exe', '-v'], { shell: 'cmd.exe' })
        bin.add('nvm')
      } catch (e) {}

      try {
        await execPromise('nvm -v', { shell: 'powershell.exe' })
        bin.add('nvm')
      } catch (e) {}

      try {
        const res = await execPromise('set NVM_HOME', { shell: 'cmd.exe' })
        const dir = res?.stdout?.trim()?.replace('NVM_HOME=', '')?.trim()
        if (dir && existsSync(dir) && existsSync(join(dir, 'nvm.exe'))) {
          NVM_HOME = dir
          bin.add('nvm')
        }
      } catch (e) {}

      try {
        await spawnPromise('cmd.exe', ['/c', 'fnm.exe', '-V'], { shell: 'cmd.exe' })
        bin.add('fnm')
      } catch (e) {}

      try {
        await execPromise('fnm -V', { shell: 'powershell.exe' })
        bin.add('fnm')
      } catch (e) {}

      try {
        const res = await execPromise('set FNM_HOME', { shell: 'cmd.exe' })
        const dir = res?.stdout?.trim()?.replace('FNM_HOME=', '')?.trim()
        if (dir && existsSync(dir) && existsSync(join(dir, 'fnm.exe'))) {
          FNM_HOME = dir
          bin.add('fnm')
        }
      } catch (e) {}

      if (bin.size === 2) {
        resolve({
          tool: 'all',
          NVM_HOME,
          FNM_HOME
        })
        return
      }

      resolve({
        tool: [...bin].pop() ?? '',
        NVM_HOME,
        FNM_HOME
      })
    })
  }

  allInstalled() {
    return new ForkPromise(async (resolve) => {
      const all: any[] = []
      let fnmDir = ''
      try {
        fnmDir = (
          await execPromise(`echo %FNM_DIR%`, {
            shell: 'cmd.exe'
          })
        ).stdout.trim()
        if (fnmDir === '%FNM_DIR%') {
          fnmDir = ''
        }
      } catch (e) {}
      if (!fnmDir) {
        try {
          fnmDir = (
            await execPromise(`$env:FNM_DIR`, {
              shell: 'powershell.exe'
            })
          ).stdout.trim()
        } catch (e) {}
      }
      if (fnmDir && existsSync(fnmDir)) {
        fnmDir = join(fnmDir, 'node-versions')
        if (existsSync(fnmDir)) {
          let allFnm: any[] = []
          try {
            allFnm = await readdir(fnmDir)
          } catch (e) {}
          allFnm = allFnm
            .filter(
              (f) => f.startsWith('v') && existsSync(join(fnmDir, f, 'installation/node.exe'))
            )
            .map((f) => {
              const version = f.replace('v', '')
              const bin = join(fnmDir, f, 'installation/node.exe')
              return {
                version,
                bin
              }
            })
          all.push(...allFnm)
        }
      }

      let nvmDir = ''
      try {
        nvmDir = (
          await execPromise(`nvm root`, {
            shell: 'cmd.exe'
          })
        ).stdout
          .trim()
          .replace('Current Root: ', '')
      } catch (e) {}
      if (!nvmDir) {
        try {
          nvmDir = (
            await execPromise(`nvm root`, {
              shell: 'powershell.exe'
            })
          ).stdout
            .trim()
            .replace('Current Root: ', '')
        } catch (e) {}
      }
      if (nvmDir && existsSync(nvmDir)) {
        if (existsSync(nvmDir)) {
          let allNVM: any[] = []
          try {
            allNVM = await readdir(nvmDir)
          } catch (e) {}
          allNVM = allNVM
            .filter((f) => f.startsWith('v') && existsSync(join(nvmDir, f, 'node.exe')))
            .map((f) => {
              const version = f.replace('v', '')
              const bin = join(nvmDir, f, 'node.exe')
              return {
                version,
                bin
              }
            })
          all.push(...allNVM)
        }
      }
      resolve(all)
    })
  }
}

export default new Manager()
