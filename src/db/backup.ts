import { db } from './db'

const STORES = [
  'sources',
  'teams',
  'people',
  'rosterMemberships',
  'roles',
  'events',
  'assignments',
] as const

export interface BackupFile {
  app: 'mih-schedule'
  version: 1
  exportedAt: string
  data: Record<string, unknown[]>
}

export async function exportBackup(): Promise<BackupFile> {
  const data: Record<string, unknown[]> = {}
  for (const name of STORES) {
    data[name] = await (db as any)[name].toArray()
  }
  return {
    app: 'mih-schedule',
    version: 1,
    exportedAt: new Date().toISOString(),
    data,
  }
}

export async function importBackup(file: BackupFile): Promise<void> {
  if (file.app !== 'mih-schedule') {
    throw new Error('Keine gültige MIH-Sicherungsdatei.')
  }
  await db.transaction('rw', db.tables, async () => {
    for (const name of STORES) {
      await (db as any)[name].clear()
      const rows = file.data[name] ?? []
      if (rows.length) await (db as any)[name].bulkAdd(rows)
    }
  })
}

export function downloadBackup(backup: BackupFile): void {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `mih-backup-${backup.exportedAt.slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}
