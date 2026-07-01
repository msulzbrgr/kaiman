import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { fmtDate, fmtTime } from '../../lib/dateParse'
import ImportDialog from './ImportDialog'

export default function SourcesPage() {
  const [showImport, setShowImport] = useState(false)
  const sources = useLiveQuery(() => db.sources.toArray(), [], [])
  const eventCounts = useLiveQuery(async () => {
    const all = await db.events.toArray()
    const map: Record<number, number> = {}
    for (const e of all) if (e.sourceId != null) map[e.sourceId] = (map[e.sourceId] ?? 0) + 1
    return map
  }, [], {} as Record<number, number>)

  async function removeSource(id: number) {
    if (!confirm('Quelle entfernen? Importierte Events dieser Quelle werden gelöscht. Manuell erstellte Daten bleiben erhalten.')) return
    await db.transaction('rw', db.events, db.assignments, db.sources, async () => {
      const evs = await db.events.where('sourceId').equals(id).toArray()
      for (const e of evs) await db.assignments.where('eventId').equals(e.id!).delete()
      await db.events.where('sourceId').equals(id).delete()
      await db.sources.delete(id)
    })
  }

  return (
    <div className="page">
      <div className="toolbar">
        <h2 style={{ flex: 1, margin: 0 }}>Quellen</h2>
        <button className="btn primary" onClick={() => setShowImport(true)}>
          + Datei importieren
        </button>
      </div>
      <p className="muted">
        XLS ist aktuell die einzige implementierte Quelle. Beim erneuten Import einer
        gleichnamigen Datei werden Events zusammengeführt (Merge) – manuelle Zuordnungen
        bleiben erhalten.
      </p>

      {sources.length === 0 ? (
        <p className="muted">Noch keine Quellen importiert.</p>
      ) : (
        <div className="table-scroll-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th>Datei</th><th>Typ</th><th>Events</th><th>Importiert</th><th></th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.id}>
                  <td>{s.fileName}</td>
                  <td><span className="badge">{s.kind}</span></td>
                  <td>{eventCounts[s.id!] ?? 0}</td>
                  <td>{fmtDate(s.importedAt)} {fmtTime(s.importedAt)}</td>
                  <td>
                    <button className="btn sm danger" onClick={() => removeSource(s.id!)}>
                      Entfernen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showImport && <ImportDialog onClose={() => setShowImport(false)} />}
    </div>
  )
}
