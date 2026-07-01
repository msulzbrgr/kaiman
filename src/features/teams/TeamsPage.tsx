import { Fragment, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { mergeTeams } from '../../db/repo'
import { ageGroupHint, cleanText, normKey, teamColor } from '../../lib/normalize'
import { InlineText } from '../../components/Inline'
import RosterEditor from './RosterEditor'

export default function TeamsPage() {
  const teams = useLiveQuery(() => db.teams.toArray(), [], [])
  const memberCounts = useLiveQuery(async () => {
    const all = await db.rosterMemberships.toArray()
    const m: Record<number, number> = {}
    for (const r of all) m[r.teamId] = (m[r.teamId] ?? 0) + 1
    return m
  }, [], {} as Record<number, number>)
  const [expanded, setExpanded] = useState<number | null>(null)

  const sorted = useMemo(() => [...teams].sort((a, b) => a.name.localeCompare(b.name)), [teams])

  async function createTeam() {
    const name = prompt('Team-Name:')
    if (!name?.trim()) return
    const clean = cleanText(name)
    const exists = await db.teams.get({ nameKey: normKey(clean) })
    if (exists) {
      alert('Team existiert bereits.')
      return
    }
    await db.teams.add({
      name: clean,
      nameKey: normKey(clean),
      ageGroup: ageGroupHint(clean),
      color: teamColor(await db.teams.count()),
    })
  }

  async function renameTeam(id: number, name: string) {
    const clean = cleanText(name)
    if (!clean) return
    await db.teams.update(id, { name: clean, nameKey: normKey(clean), ageGroup: ageGroupHint(clean) })
  }

  async function deleteTeam(id: number) {
    const count = await db.events.where('teamId').equals(id).count()
    if (!confirm(`Team löschen? ${count} zugeordnete Events werden ebenfalls gelöscht.`)) return
    await db.transaction('rw', db.events, db.assignments, db.rosterMemberships, db.teams, async () => {
      const evs = await db.events.where('teamId').equals(id).toArray()
      for (const e of evs) await db.assignments.where('eventId').equals(e.id!).delete()
      await db.events.where('teamId').equals(id).delete()
      await db.rosterMemberships.where('teamId').equals(id).delete()
      await db.teams.delete(id)
    })
  }

  return (
    <div className="page">
      <div className="toolbar">
        <h2 style={{ flex: 1, margin: 0 }}>Teams</h2>
        <button className="btn primary" onClick={createTeam}>+ Team</button>
      </div>

      <table className="grid">
        <thead>
          <tr><th>Farbe</th><th>Name</th><th>Altersgruppe</th><th>Kader</th><th>Aktionen</th></tr>
        </thead>
        <tbody>
          {sorted.map((t) => (
            <Fragment key={t.id}>
              <tr>
                <td>
                  <input
                    type="color"
                    value={t.color}
                    onChange={(e) => db.teams.update(t.id!, { color: e.target.value })}
                    style={{ width: 34, height: 26, border: 'none', background: 'none' }}
                  />
                </td>
                <td style={{ minWidth: 200 }}>
                  <InlineText value={t.name} onSave={(v) => renameTeam(t.id!, v)} />
                </td>
                <td>{t.ageGroup || <span className="muted">—</span>}</td>
                <td>{memberCounts[t.id!] ?? 0}</td>
                <td>
                  <div className="row">
                    <button className="btn sm" onClick={() => setExpanded(expanded === t.id ? null : t.id!)}>
                      {expanded === t.id ? 'Kader schließen' : 'Kader'}
                    </button>
                    <select
                      defaultValue=""
                      onChange={(e) => {
                        const target = Number(e.target.value)
                        if (target && confirm(`„${t.name}“ in das Zielteam zusammenführen?`)) {
                          mergeTeams(t.id!, target)
                        }
                        e.target.value = ''
                      }}
                    >
                      <option value="">Zusammenführen…</option>
                      {sorted.filter((o) => o.id !== t.id).map((o) => (
                        <option key={o.id} value={o.id}>→ {o.name}</option>
                      ))}
                    </select>
                    <button className="btn sm danger" onClick={() => deleteTeam(t.id!)}>Löschen</button>
                  </div>
                </td>
              </tr>
              {expanded === t.id && (
                <tr>
                  <td colSpan={5} style={{ background: '#fafbfc' }}>
                    <RosterEditor teamId={t.id!} />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
          {sorted.length === 0 && (
            <tr><td colSpan={5} className="muted">Noch keine Teams. Importiere eine Datei oder lege eines an.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
