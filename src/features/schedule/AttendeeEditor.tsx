import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { addAssignment, addRosterMember, getOrCreatePerson } from '../../db/repo'
import type { Person } from '../../db/types'

export default function AttendeeEditor({
  eventId,
  teamId,
}: {
  eventId: number
  teamId: number
}) {
  const roles = useLiveQuery(() => db.roles.orderBy('order').toArray(), [], [])
  const people = useLiveQuery(() => db.people.toArray(), [], [])
  const assignments = useLiveQuery(
    () => db.assignments.where('eventId').equals(eventId).toArray(),
    [eventId],
    [],
  )
  const roster = useLiveQuery(
    () => db.rosterMemberships.where('teamId').equals(teamId).toArray(),
    [teamId],
    [],
  )

  const personById = useMemo(() => new Map(people.map((p) => [p.id!, p])), [people])
  const rosterIds = useMemo(() => new Set(roster.map((r) => r.personId)), [roster])

  async function changeRole(assignmentId: number, roleId: number) {
    await db.assignments.update(assignmentId, { roleId })
  }
  async function remove(assignmentId: number) {
    await db.assignments.delete(assignmentId)
  }
  async function add(personId: number, roleId: number) {
    await addAssignment(eventId, personId, roleId)
    await addRosterMember(teamId, personId, roleId)
  }
  async function addNew(name: string, roleId: number) {
    const personId = await getOrCreatePerson(name)
    await add(personId, roleId)
  }

  return (
    <div>
      {roles.map((role) => {
        const inRole = assignments.filter((a) => a.roleId === role.id)
        return (
          <div className="role-group" key={role.id}>
            <h4>{role.label} <span className="muted">({inRole.length})</span></h4>
            <div className="chips">
              {inRole.map((a) => {
                const p = personById.get(a.personId)
                return (
                  <span className="chip" key={a.id}>
                    {p?.displayName ?? '?'}
                    <select
                      value={role.id}
                      onChange={(e) => changeRole(a.id!, Number(e.target.value))}
                      title="Rolle ändern"
                    >
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>{r.label}</option>
                      ))}
                    </select>
                    <button className="x" onClick={() => remove(a.id!)} title="Entfernen">✕</button>
                  </span>
                )
              })}
            </div>
            <AddTypeahead
              people={people}
              rosterIds={rosterIds}
              excludeIds={new Set(inRole.map((a) => a.personId))}
              onPick={(id) => add(id, role.id!)}
              onCreate={(name) => addNew(name, role.id!)}
            />
          </div>
        )
      })}
      {roles.length === 0 && <p className="muted">Keine Rollen definiert.</p>}
    </div>
  )
}

function AddTypeahead({
  people,
  rosterIds,
  excludeIds,
  onPick,
  onCreate,
}: {
  people: Person[]
  rosterIds: Set<number>
  excludeIds: Set<number>
  onPick: (id: number) => void
  onCreate: (name: string) => void
}) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const candidates = people.filter((p) => !excludeIds.has(p.id!))
    const scored = candidates
      .filter((p) => needle === '' || p.displayName.toLowerCase().includes(needle))
      .sort((a, b) => {
        // roster members first
        const ra = rosterIds.has(a.id!) ? 0 : 1
        const rb = rosterIds.has(b.id!) ? 0 : 1
        if (ra !== rb) return ra - rb
        return a.displayName.localeCompare(b.displayName)
      })
    return scored.slice(0, 8)
  }, [q, people, excludeIds, rosterIds])

  const exactExists = people.some((p) => p.displayName.toLowerCase() === q.trim().toLowerCase())

  return (
    <div className="typeahead">
      <input
        className="searchbox"
        style={{ marginTop: 6, marginBottom: 0 }}
        placeholder="+ Person hinzufügen…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && (q.trim() !== '' || matches.length > 0) && (
        <div className="typeahead-menu">
          {matches.map((p) => (
            <button
              key={p.id}
              onMouseDown={(e) => {
                e.preventDefault()
                onPick(p.id!)
                setQ('')
                setOpen(false)
              }}
            >
              {p.displayName}
              {rosterIds.has(p.id!) && <span className="muted"> · Kader</span>}
            </button>
          ))}
          {q.trim() !== '' && !exactExists && (
            <button
              onMouseDown={(e) => {
                e.preventDefault()
                onCreate(q.trim())
                setQ('')
                setOpen(false)
              }}
            >
              + Neu anlegen: „{q.trim()}“
            </button>
          )}
        </div>
      )}
    </div>
  )
}
