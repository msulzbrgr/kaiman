import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { getOrCreatePerson, mergePeople } from '../../db/repo'
import { normKey } from '../../lib/normalize'
import { parsePersonName } from '../../lib/nameParse'
import { InlineText } from '../../components/Inline'

export default function PeoplePage() {
  const people = useLiveQuery(() => db.people.orderBy('displayName').toArray(), [], [])
  const teams = useLiveQuery(() => db.teams.toArray(), [], [])
  const memberships = useLiveQuery(() => db.rosterMemberships.toArray(), [], [])
  const assignments = useLiveQuery(() => db.assignments.toArray(), [], [])
  const [q, setQ] = useState('')

  const teamById = useMemo(() => new Map(teams.map((t) => [t.id!, t])), [teams])
  const teamsByPerson = useMemo(() => {
    const m = new Map<number, Set<number>>()
    for (const r of memberships) {
      if (!m.has(r.personId)) m.set(r.personId, new Set())
      m.get(r.personId)!.add(r.teamId)
    }
    return m
  }, [memberships])
  const eventCountByPerson = useMemo(() => {
    const m = new Map<number, number>()
    for (const a of assignments) m.set(a.personId, (m.get(a.personId) ?? 0) + 1)
    return m
  }, [assignments])

  const filtered = people.filter((p) => p.displayName.toLowerCase().includes(q.toLowerCase()))

  async function createPerson() {
    const name = prompt('Name (Nachname Vorname):')
    if (!name?.trim()) return
    const exists = await db.people.get({ nameKey: normKey(parsePersonName(name).displayName) })
    if (exists) {
      alert('Person existiert bereits.')
      return
    }
    await getOrCreatePerson(name.trim())
  }

  async function renamePerson(id: number, name: string) {
    const parsed = parsePersonName(name)
    if (!parsed.displayName) return
    await db.people.update(id, {
      lastName: parsed.lastName,
      firstName: parsed.firstName,
      displayName: parsed.displayName,
      nameKey: normKey(parsed.displayName),
    })
  }

  async function deletePerson(id: number) {
    const n = eventCountByPerson.get(id) ?? 0
    if (!confirm(`Person löschen? ${n} Zuordnungen werden entfernt.`)) return
    await db.transaction('rw', db.assignments, db.rosterMemberships, db.people, async () => {
      await db.assignments.where('personId').equals(id).delete()
      await db.rosterMemberships.where('personId').equals(id).delete()
      await db.people.delete(id)
    })
  }

  return (
    <div className="page">
      <div className="toolbar">
        <h2 style={{ flex: 1, margin: 0 }}>Personen</h2>
        <input className="searchbox" style={{ width: 220, marginBottom: 0 }} placeholder="Suchen…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn primary" onClick={createPerson}>+ Person</button>
      </div>

      <div className="table-scroll-wrap">
        <table className="grid">
          <thead>
            <tr><th>Name</th><th>Teams</th><th>Einsätze</th><th>Aktionen</th></tr>
          </thead>
        <tbody>
          {filtered.map((p) => (
            <tr key={p.id}>
              <td style={{ minWidth: 220 }}>
                <InlineText value={p.displayName} onSave={(v) => renamePerson(p.id!, v)} />
              </td>
              <td>
                {[...(teamsByPerson.get(p.id!) ?? [])].map((tid) => (
                  <span className="badge" key={tid} style={{ marginRight: 4 }}>
                    {teamById.get(tid)?.name ?? '?'}
                  </span>
                ))}
              </td>
              <td>{eventCountByPerson.get(p.id!) ?? 0}</td>
              <td>
                <div className="row">
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      const target = Number(e.target.value)
                      if (target && confirm(`„${p.displayName}“ in die Zielperson zusammenführen?`)) {
                        mergePeople(p.id!, target)
                      }
                      e.target.value = ''
                    }}
                  >
                    <option value="">Zusammenführen…</option>
                    {people.filter((o) => o.id !== p.id).map((o) => (
                      <option key={o.id} value={o.id}>→ {o.displayName}</option>
                    ))}
                  </select>
                  <button className="btn sm danger" onClick={() => deletePerson(p.id!)}>Löschen</button>
                </div>
              </td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr><td colSpan={4} className="muted">Keine Personen.</td></tr>
          )}
        </tbody>
        </table>
      </div>
    </div>
  )
}
