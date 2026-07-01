import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { exportBackup, downloadBackup, importBackup, type BackupFile } from '../../db/backup'
import { InlineText } from '../../components/Inline'
import { normKey } from '../../lib/normalize'

export default function SettingsPage() {
  const roles = useLiveQuery(() => db.roles.orderBy('order').toArray(), [], [])

  async function addRole() {
    const label = prompt('Name der Rolle:')
    if (!label?.trim()) return
    const max = roles.reduce((m, r) => Math.max(m, r.order), 0)
    await db.roles.add({
      key: normKey(label) + '_' + (max + 1),
      label: label.trim(),
      order: max + 1,
      isBuiltin: false,
    })
  }

  async function move(id: number, dir: -1 | 1) {
    const idx = roles.findIndex((r) => r.id === id)
    const swapIdx = idx + dir
    if (swapIdx < 0 || swapIdx >= roles.length) return
    const a = roles[idx]
    const b = roles[swapIdx]
    await db.roles.update(a.id!, { order: b.order })
    await db.roles.update(b.id!, { order: a.order })
  }

  async function deleteRole(id: number) {
    const used = await db.assignments.where('roleId').equals(id).count()
    if (used > 0) {
      alert(`Rolle wird von ${used} Zuordnungen verwendet und kann nicht gelöscht werden.`)
      return
    }
    if (!confirm('Rolle löschen?')) return
    await db.roles.delete(id)
  }

  async function doExport() {
    downloadBackup(await exportBackup())
  }

  async function doImport(file: File) {
    if (!confirm('Import ersetzt alle aktuellen Daten. Fortfahren?')) return
    const text = await file.text()
    try {
      await importBackup(JSON.parse(text) as BackupFile)
      alert('Sicherung wiederhergestellt.')
    } catch (e) {
      alert('Fehler: ' + (e as Error).message)
    }
  }

  async function wipe() {
    if (!confirm('Wirklich ALLE Daten löschen?')) return
    await db.transaction('rw', db.tables, async () => {
      for (const t of db.tables) await t.clear()
    })
    location.reload()
  }

  return (
    <div className="page">
      <h2>Einstellungen</h2>

      <h3>Rollen</h3>
      <p className="muted">
        Rollen für die Zuordnung von Personen zu Events. Standard-Rollen können umbenannt,
        aber nicht gelöscht werden.
      </p>
      <table className="grid" style={{ maxWidth: 560 }}>
        <thead><tr><th>Reihenfolge</th><th>Bezeichnung</th><th></th></tr></thead>
        <tbody>
          {roles.map((r, i) => (
            <tr key={r.id}>
              <td>
                <button className="btn sm" disabled={i === 0} onClick={() => move(r.id!, -1)}>↑</button>{' '}
                <button className="btn sm" disabled={i === roles.length - 1} onClick={() => move(r.id!, 1)}>↓</button>
              </td>
              <td style={{ minWidth: 220 }}>
                <InlineText value={r.label} onSave={(v) => db.roles.update(r.id!, { label: v })} />
              </td>
              <td>
                {r.isBuiltin ? (
                  <span className="muted">Standard</span>
                ) : (
                  <button className="btn sm danger" onClick={() => deleteRole(r.id!)}>Löschen</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="btn" style={{ marginTop: 10 }} onClick={addRole}>+ Rolle</button>

      <h3 style={{ marginTop: 28 }}>Datensicherung</h3>
      <p className="muted">
        Alle Daten liegen lokal im Browser (IndexedDB). Exportiere eine JSON-Sicherung, um
        Daten zu sichern oder auf einen anderen Rechner zu übertragen.
      </p>
      <div className="row">
        <button className="btn" onClick={doExport}>Export (JSON)</button>
        <label className="btn">
          Import (JSON)
          <input
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={(e) => e.target.files?.[0] && doImport(e.target.files[0])}
          />
        </label>
        <span className="spacer" />
        <button className="btn danger" onClick={wipe}>Alle Daten löschen</button>
      </div>
    </div>
  )
}
