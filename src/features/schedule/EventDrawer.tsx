import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { duplicateEvent } from '../../db/repo'
import { fmtDate } from '../../lib/dateParse'
import { InlineText, InlineTextarea } from '../../components/Inline'
import AttendeeEditor from './AttendeeEditor'
import type { ScheduleEvent } from '../../db/types'

function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function fromLocalInput(s: string): string | null {
  if (!s) return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

export default function EventDrawer({
  eventId,
  onClose,
  onDuplicate,
}: {
  eventId: number
  onClose: () => void
  onDuplicate: (newId: number) => void
}) {
  const event = useLiveQuery(() => db.events.get(eventId), [eventId])
  const teams = useLiveQuery(() => db.teams.toArray(), [], [])

  if (!event) return null

  const update = (patch: Partial<ScheduleEvent>) => db.events.update(eventId, patch)

  async function handleDuplicate() {
    const newId = await duplicateEvent(eventId)
    onDuplicate(newId)
  }

  async function deleteEvent() {
    if (!confirm('Event endgültig löschen?')) return
    await db.assignments.where('eventId').equals(eventId).delete()
    await db.events.delete(eventId)
    onClose()
  }

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <h2 style={{ flex: 1 }}>
            {event.type === 'game' ? 'Spiel' : 'Training'}
            {event.status === 'cancelled' && <span className="badge game" style={{ marginLeft: 8 }}>Entfällt</span>}
          </h2>
          <button className="btn sm" onClick={onClose}>✕</button>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          {event.start ? fmtDate(event.start) : 'Ohne Datum'}
        </p>

        <div className="field">
          <label>Typ</label>
          <div className="row">
            <select
              value={event.type}
              onChange={(e) => update({ type: e.target.value as ScheduleEvent['type'] })}
            >
              <option value="training">Training</option>
              <option value="game">Spiel</option>
            </select>
            {event.type === 'game' && (
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={event.home}
                  onChange={(e) => update({ home: e.target.checked })}
                />
                Heimspiel
              </label>
            )}
          </div>
        </div>

        <div className="field">
          <label>Team</label>
          <select
            value={event.teamId}
            onChange={(e) => update({ teamId: Number(e.target.value) })}
          >
            {teams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        <div className="row" style={{ gap: 12 }}>
          <div className="field" style={{ flex: 1 }}>
            <label>Start</label>
            <input
              type="datetime-local"
              value={toLocalInput(event.start)}
              onChange={(e) => update({ start: fromLocalInput(e.target.value) })}
            />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Ende</label>
            <input
              type="datetime-local"
              value={toLocalInput(event.end)}
              onChange={(e) => update({ end: fromLocalInput(e.target.value) })}
            />
          </div>
        </div>

        <div className="field">
          <label>Art</label>
          <InlineText value={event.art} placeholder="z.B. Eistraining" onSave={(v) => update({ art: v })} />
        </div>
        {event.type === 'game' && (
          <div className="field">
            <label>Gegner</label>
            <InlineText value={event.opponent} placeholder="Gegner" onSave={(v) => update({ opponent: v })} />
          </div>
        )}
        <div className="field">
          <label>Ort</label>
          <InlineText value={event.location} placeholder="Ort" onSave={(v) => update({ location: v })} />
        </div>
        <div className="row" style={{ gap: 12 }}>
          <div className="field" style={{ flex: 1 }}>
            <label>Treffpunkt</label>
            <InlineText value={event.meetingPoint} onSave={(v) => update({ meetingPoint: v })} />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Abfahrt</label>
            <InlineText value={event.departure} onSave={(v) => update({ departure: v })} />
          </div>
        </div>
        <div className="field">
          <label>Bemerkungen</label>
          <InlineTextarea value={event.remarks} onSave={(v) => update({ remarks: v })} />
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '16px 0' }} />
        <h3 style={{ margin: '0 0 4px' }}>Beteiligte</h3>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          Personen aus dem Team-Kader hinzufügen, Rolle anpassen oder entfernen.
        </p>
        <AttendeeEditor eventId={eventId} teamId={event.teamId} />

        <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '16px 0' }} />
        <div className="row">
          <button
            className="btn sm"
            onClick={() =>
              update({ status: event.status === 'cancelled' ? 'active' : 'cancelled' })
            }
          >
            {event.status === 'cancelled' ? 'Reaktivieren' : 'Als „entfällt“ markieren'}
          </button>
          <span className="spacer" />
          <button className="btn sm" title="Duplizieren" onClick={handleDuplicate}>⧉</button>
          <button className="btn sm danger" onClick={deleteEvent}>Löschen</button>
        </div>
      </div>
    </div>
  )
}
