import { execPromiseRoot } from './Fn'

export type PItem = {
  ProcessId: string
  ParentProcessId: string
  CommandLine: string
  children?: PItem[]
}

export const ProcessPidList = async (): Promise<PItem[]> => {
  const all: PItem[] = []
  const command = `powershell.exe -command "Get-CimInstance Win32_Process | Select-Object CommandLine,ProcessId,ParentProcessId | ConvertTo-Json"`
  try {
    const res = await execPromiseRoot(command)
    const list = JSON.parse(res?.stdout ?? '[]')
    all.push(...list)
  } catch (e) {
    console.log('ProcessPidList err0: ', e)
  }
  return all
}

export const ProcessPidListByPids = async (pids: string[]): Promise<string[]> => {
  const all: Set<string> = new Set()
  const arr = await ProcessPidList()
  console.log('arr: ', pids, arr)
  const find = (ppid: string) => {
    for (const item of arr) {
      if (item.ParentProcessId === ppid) {
        console.log('find: ', ppid, item)
        all.add(item.ProcessId!)
        find(item.ProcessId!)
      }
    }
  }

  for (const pid of pids) {
    if (arr.find((a) => a.ProcessId === pid)) {
      all.add(pid)
      find(pid)
    }
    const item = arr.find((a) => a.ParentProcessId === pid)
    if (item) {
      all.add(pid)
      all.add(item.ProcessId)
      find(pid)
      find(item.ProcessId)
    }
  }
  return [...all]
}

export const ProcessPidListByPid = async (pid: string): Promise<string[]> => {
  const all: Set<string> = new Set()
  const arr = await ProcessPidList()
  console.log('arr: ', pid, arr)
  const find = (ppid: string) => {
    for (const item of arr) {
      if (item.ParentProcessId === ppid) {
        console.log('find: ', ppid, item)
        all.add(item.ProcessId!)
        find(item.ProcessId!)
      }
    }
  }
  if (arr.find((a) => a.ProcessId === pid)) {
    all.add(pid)
    find(pid)
  }
  const item = arr.find((a) => a.ParentProcessId === pid)
  if (item) {
    all.add(pid)
    all.add(item.ProcessId)
    find(pid)
    find(item.ProcessId)
  }
  return [...all]
}

export const ProcessListSearch = async (search: string, aA = true) => {
  const all: PItem[] = []
  if (!search) {
    return all
  }
  const arr = await ProcessPidList()
  const find = (ppid: string) => {
    for (const item of arr) {
      if (item.ParentProcessId === ppid) {
        if (!all.find((f) => f.ProcessId === item.ProcessId)) {
          all.push(item)
          find(item.ProcessId!)
        }
      }
    }
  }
  for (const item of arr) {
    if (!item?.CommandLine) {
      console.log('!item?.CommandLine: ', item)
    }
    if (!aA) {
      search = search.toLowerCase()
      if (item?.CommandLine && item.CommandLine.toLowerCase().includes(search)) {
        if (!all.find((f) => f.ProcessId === item.ProcessId)) {
          all.push(item)
          find(item.ProcessId!)
        }
      }
    } else {
      if (item?.CommandLine && item.CommandLine.includes(search)) {
        if (!all.find((f) => f.ProcessId === item.ProcessId)) {
          all.push(item)
          find(item.ProcessId!)
        }
      }
    }
  }
  return all
}
