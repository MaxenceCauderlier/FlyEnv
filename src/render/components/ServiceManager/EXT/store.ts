import { reactive } from 'vue'
import IPC from '@/util/IPC'
import { SoftInstalled } from '@/store/brew'
import { I18nT } from '@shared/lang'
import { MessageError, MessageSuccess } from '@/util/Element'
import Base from '@/core/Base'
import { reGetInstalled, stopService } from '@/util/Service'
import { fetchVerion } from '@/util/Brew'
import { AppStore } from '@/store/app'

const { join } = require('path')
const { remove, existsSync } = require('fs-extra')

type ServiceActionType = {
  versionDeling: Record<string, boolean>
  pathSeting: Record<string, boolean>
  aliasSeting: Record<string, boolean>
  allPath: string[]
  fetchPathing: boolean
  fetchPath: () => void
  editAliasItem?: SoftInstalled
  onAliasEnd: (e?: MouseEvent) => void
  showAlias: (item: SoftInstalled) => void
  setAlias: (item: SoftInstalled, name: string) => void
  updatePath: (item: SoftInstalled, typeFlag: string) => void
  delVersion: (item: SoftInstalled, typeFlag: string) => void
}

export const ServiceActionStore: ServiceActionType = reactive({
  versionDeling: {},
  pathSeting: {},
  aliasSeting: {},
  allPath: [],
  fetchPathing: false,
  onAliasEnd() {
    delete this.editAliasItem?.aliasEditing
    const store = AppStore()
    const newAlisa = this.editAliasItem?.alias ?? ''
    const oldAlisa = store.config.setup?.alias?.[this.editAliasItem!.bin] ?? ''
    console.log('newAlisa: ', newAlisa, oldAlisa)
    if (newAlisa === oldAlisa) {
      return
    }
    this.setAlias(this.editAliasItem!, newAlisa)
  },
  showAlias(item: SoftInstalled) {
    if (this.aliasSeting[item.bin]) {
      return
    }
    const store = AppStore()
    item.alias = store.config.setup?.alias?.[item.bin] ?? ''
    item.aliasEditing = true
    this.editAliasItem = item
  },
  setAlias(item: SoftInstalled, name: string) {
    console.log('setAlias: ', item, name)
    if (this.aliasSeting[item.bin]) {
      return
    }
    this.aliasSeting[item.bin] = true
    const store = AppStore()
    const oldName = store.config.setup?.alias?.[item.bin] ?? ''
    IPC.send('app-fork:tools', 'setAlias', JSON.parse(JSON.stringify(item)), name, oldName).then(
      (key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0) {
          if (name) {
            if (!store.config.setup.alias) {
              store.config.setup.alias = reactive({})
            }
            store.config.setup.alias[item.bin] = name
          } else {
            delete store.config.setup?.alias?.[item.bin]
          }
          item.alias = name
          store.saveConfig().then().catch()
        } else {
          MessageError(res?.msg ?? I18nT('base.fail'))
        }
        delete this.aliasSeting[item.bin]
        delete item?.aliasEditing
        delete this.editAliasItem
      }
    )
  },
  fetchPath() {
    if (ServiceActionStore.fetchPathing) {
      return
    }
    ServiceActionStore.fetchPathing = true
    IPC.send('app-fork:tools', 'fetchPATH').then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0 && res?.data?.length > 0) {
        ServiceActionStore.allPath = reactive([...res.data])
        setTimeout(() => {
          ServiceActionStore.fetchPathing = false
        }, 60000)
      }
    })
  },
  updatePath(item: SoftInstalled, typeFlag: string) {
    if (ServiceActionStore.pathSeting?.[item.bin]) {
      return
    }
    ServiceActionStore.pathSeting[item.bin] = true
    IPC.send('app-fork:tools', 'updatePATH', JSON.parse(JSON.stringify(item)), typeFlag).then(
      (key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0 && res?.data?.length > 0) {
          ServiceActionStore.allPath = reactive([...res.data])
          MessageSuccess(I18nT('base.success'))
        } else {
          MessageError(res?.msg ?? I18nT('base.fail'))
        }
        delete ServiceActionStore.pathSeting?.[item.bin]
      }
    )
  },
  delVersion(item: SoftInstalled, type: string) {
    if (ServiceActionStore.versionDeling?.[item.bin]) {
      return
    }
    ServiceActionStore.versionDeling[item.bin] = true

    Base._Confirm(I18nT('base.delAlertContent'), undefined, {
      customClass: 'confirm-del',
      type: 'warning'
    })
      .then(async () => {
        if (item?.run) {
          try {
            await stopService(type as any, item)
          } catch (e) {}
        }
        if (existsSync(item.path)) {
          try {
            await remove(item.path)
          } catch (e) {}
        }

        let local7ZFile = join(global.Server.Static!, `zip/${type}-${item.version}.7z`)
        if (existsSync(local7ZFile)) {
          const store = AppStore()
          if (!store.config.setup.excludeLocalVersion) {
            store.config.setup.excludeLocalVersion = []
          }
          const arr: string[] = Array.from(
            new Set(JSON.parse(JSON.stringify(store.config.setup.excludeLocalVersion)))
          )
          arr.push(`${type}-${item.version}`)
          store.config.setup.excludeLocalVersion = arr
          await store.saveConfig()
        }
        local7ZFile = join(global.Server.Static!, `cache/${type}-${item.version}.7z`)
        if (existsSync(local7ZFile)) {
          try {
            await remove(local7ZFile)
          } catch (e) {}
        }
        await reGetInstalled(type as any)
        fetchVerion(type as any).then()
        delete ServiceActionStore.versionDeling[item.bin]
      })
      .catch(() => {
        delete ServiceActionStore.versionDeling[item.bin]
      })
  }
} as ServiceActionType)

ServiceActionStore.onAliasEnd = ServiceActionStore.onAliasEnd.bind(ServiceActionStore)
