import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { addRosterMember, getOrCreatePerson } from '../../db/repo'

export default function RosterEditor({ teamId }: { teamId: number }) {
  const roles = useLiveQuery(() => db.roles.orderBy('order').toArray(), [], [])
  const people = useLiveQuery(() => db.people.toArray(), [], [])
  const members = useLiveQuery(
    () => db.rosterMemberships.where('teamId').equals(teamId).toArray(),
    [teamId],
    [],
  )
  const [q, setQ] = useState('')

  const personById = useMemo(() => new Map(people.map((p) => [p.id!, p])), [people])
  const memberIds = useMemo(() => new Set(members.map((m) => m.personId)), [members])
  const defaultRoleId = roles[0]?.id ?? 1

  const matches = people
    .filter((p) => !memberIds.has(p.id!))
    .filter((p) => q.trim() && p.displayName.toLowerCase().includes(q.trim().toLowerCase()))
    .slice(0, 6)
  const exactExists = people.some((p) => p.displayName.toLowerCase() === q.trim().toLowerCase())

  return (
    <div style={{ padding: '10px 0 4px' }}>
      <table className="grid" style={{ marginBottom: 12 }}>
        <thead>
          <tr><th>Person</th><th>Standard-Rolle</th><th></th></tr>
        </thead>
        <tbody>
          {members.length === 0 && (
            <tr><td colSpan={3} className="muted">Noch keine Personen im Kader.</td></tr>
          )}
          {members.map((m) => (
            <tr key={m.id}>
              <td>{personById.get(m.personId)?.displayName ?? '?'}</td>
              <td>
                <select
                  value={m.defaultRoleId}
                  onChange={(e) => db.rosterMemberships.update(m.id!, { defaultRoleId: Number(e.target.value) })}
                >
                  {roles.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
              </td>
              <td>
                <button className="btn sm danger" onClick={() => db.rosterMemberships.delete(m.id!)}>
                  Entfernen
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="typeahead" style={{ maxWidth: 320 }}>
        <input
          className="searchbox"
          placeholder="+ Person zum Kader hinzufügen…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {q.trim() !== '' && (
          <div className="typeahead-menu">
            {matches.map((p) => (
              <button
                key={p.id}
                onMouseDown={(e) => {
                  e.preventDefault()
                  addRosterMember(teamId, p.id!, defaultRoleId)
                  setQ('')
                }}
              >
                {p.displayName}
              </button>
            ))}
            {!exactExists && (
              <button
                onMouseDown={async (e) => {
                  e.preventDefault()
                  const id = await getOrCreatePerson(q.trim())
                  await addRosterMember(teamId, id, defaultRoleId)
                  setQ('')
                }}
              >
                + Neu anlegen: „{q.trim()}“
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
