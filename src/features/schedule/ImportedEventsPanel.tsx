import { useRef, useEffect, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Draggable } from '@fullcalendar/interaction'
import { db } from '../../db/db'
import { fmtDate, fmtTime } from '../../lib/dateParse'
import type { ScheduleEvent } from '../../db/types'

interface Props {
  onSelect: (id: number) => void
  selectedId: number | null
  onUndo: () => void
  onRedo: () => void
  onResetSelected: () => void
  canUndo: boolean
  canRedo: boolean
  canResetSelected: boolean
}

const DEFAULT_DURATION_MS = 90 * 60 * 1000
const MIN_EVENT_DURATION_MINUTES = 15
const MS_PER_MINUTE = 60_000

export default function ImportedEventsPanel({
  onSelect,
  selectedId,
  onUndo,
  onRedo,
  onResetSelected,
  canUndo,
  canRedo,
  canResetSelected,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  const events = useLiveQuery(
    () => db.events.filter((e) => e.sourceId !== null && e.start !== null).sortBy('start'),
    [],
    [] as ScheduleEvent[],
  )
  const teams = useLiveQuery(() => db.teams.toArray(), [], [])
  const teamById = useMemo(() => new Map(teams.map((t) => [t.id!, t])), [teams])

  useEffect(() => {
    if (!containerRef.current) return
    const draggable = new Draggable(containerRef.current, {
      itemSelector: '.import-card',
      eventData: (el) => ({
        id: el.dataset.id,
        title: el.dataset.title,
        duration: el.dataset.duration,
        create: false,
      }),
    })
    return () => draggable.destroy()
  }, [])

  const grouped = useMemo(() => {
    if (!events?.length) return []
    const map = new Map<string, typeof events>()
    for (const e of events) {
      if (!e.start) continue
      const day = e.start.slice(0, 10)
      if (!map.has(day)) map.set(day, [])
      map.get(day)!.push(e)
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [events])

  return (
    <div className="imported-panel">
      <div className="imported-panel-header">
        <span className="imported-panel-title">Importierter Spielplan</span>
        <span className="muted imported-panel-hint">Karte in den Kalender ziehen zum Verschieben</span>
        <span className="spacer" />
        <button className="btn sm" aria-label="Undo last move" disabled={!canUndo} onClick={onUndo}>↶ Undo</button>
        <button className="btn sm" aria-label="Redo last move" disabled={!canRedo} onClick={onRedo}>↷ Redo</button>
        <button className="btn sm" disabled={!canResetSelected} onClick={onResetSelected}>Reset Karte</button>
      </div>
      {grouped.length === 0 ? (
        <p className="muted" style={{ padding: '0 14px', margin: '8px 0' }}>
          Keine importierten Events vorhanden.
        </p>
      ) : (
        <div className="imported-panel-body" ref={containerRef}>
          {grouped.map(([day, evs]) => (
            <div key={day} className="import-day-group">
              <div className="import-day-label">{fmtDate(`${day}T12:00:00`)}</div>
              <div className="import-day-events">
                {evs.map((e) => {
                  const team = teamById.get(e.teamId)
                  const durationMs =
                    e.start && e.end
                      ? new Date(e.end).getTime() - new Date(e.start).getTime()
                      : DEFAULT_DURATION_MS
                  const durationMin = Math.max(MIN_EVENT_DURATION_MINUTES, Math.round(durationMs / MS_PER_MINUTE))
                  const durationStr = `${String(Math.floor(durationMin / 60)).padStart(2, '0')}:${String(durationMin % 60).padStart(2, '0')}`
                  const title =
                    e.type === 'game'
                      ? `Spiel${e.opponent ? ` vs ${e.opponent}` : ''}`
                      : `Training${e.art ? ` · ${e.art}` : ''}`
                  const color = team?.color ?? '#2563eb'

                  return (
                    <div
                      key={e.id}
                      className={`import-card${e.status === 'cancelled' ? ' cancelled' : ''}${selectedId === e.id ? ' selected' : ''}`}
                      style={{ borderLeftColor: color } as React.CSSProperties}
                      data-id={String(e.id)}
                      data-title={title}
                      data-duration={durationStr}
                      onClick={() => onSelect(e.id!)}
                      title="Ziehen zum Verschieben · Klicken zum Öffnen"
                    >
                      <span className="import-card-time">{fmtTime(e.start!)}</span>
                      <span className="import-card-title">{title}</span>
                      {team && <span className="import-card-team">{team.name}</span>}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
