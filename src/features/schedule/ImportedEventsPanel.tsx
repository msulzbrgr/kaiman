import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Draggable } from '@fullcalendar/interaction'
import { db } from '../../db/db'
import { duplicateEvent } from '../../db/repo'
import { fmtDate, fmtTime } from '../../lib/dateParse'
import type { ScheduleEvent, Team } from '../../db/types'
import { EVENT_TYPE_LEGEND_ITEMS, getEventTypeIcon, getEventTypeLabel } from './eventTypePresentation'

interface Props {
  onSelect: (id: number) => void
  selectedId: number | null
  isCompact: boolean
  isCollapsed: boolean
  onToggleCompact: () => void
  onToggleCollapsed: () => void
  onUndo: () => void
  onRedo: () => void
  onResetSelected: () => void
  canUndo: boolean
  canRedo: boolean
  canResetSelected: boolean
  onDuplicate?: (newId: number) => void
  eventsData?: ScheduleEvent[]
  teamsData?: Team[]
  visibleRange?: { start: Date; end: Date } | null
  readOnly?: boolean
}

const DEFAULT_DURATION_MS = 90 * 60 * 1000
const MIN_EVENT_DURATION_MINUTES = 15
const MS_PER_MINUTE = 60_000

function formatDuration(totalMinutes: number): string {
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`
}

function getImportedEventDetail(event: ScheduleEvent): string {
  if (event.type === 'game') {
    return event.opponent ? `vs ${event.opponent}` : ''
  }

  return event.art ?? ''
}

function appendDetail(label: string, detail: string): string {
  return detail ? `${label} ${detail}` : label
}

export default function ImportedEventsPanel({
  onSelect,
  selectedId,
  isCompact,
  isCollapsed,
  onToggleCompact,
  onToggleCollapsed,
  onUndo,
  onRedo,
  onResetSelected,
  canUndo,
  canRedo,
  canResetSelected,
  onDuplicate,
  eventsData,
  teamsData,
  visibleRange,
  readOnly = false,
}: Props) {
  const [dragContainer, setDragContainer] = useState<HTMLDivElement | null>(null)

  async function handleDuplicate(eventId: number) {
    if (!onDuplicate) return
    const newId = await duplicateEvent(eventId)
    onDuplicate(newId)
  }

  const events = useLiveQuery(
    () => db.events.filter((e) => e.sourceId !== null && e.start !== null).sortBy('start'),
    [],
    [] as ScheduleEvent[],
  )
  const teams = useLiveQuery(() => db.teams.toArray(), [], [])
  const sourceEvents = eventsData ?? events
  const sourceTeams = teamsData ?? teams
  const teamById = useMemo(() => new Map(sourceTeams.map((t) => [t.id!, t])), [sourceTeams])

  const grouped = useMemo(() => {
    if (!sourceEvents?.length) return []
    const inRange = sourceEvents.filter((event) => {
      if (!event.start) return false
      if (event.sourceId === null) return false
      if (!visibleRange) return true
      const eventStart = new Date(event.start)
      const eventEnd = new Date(event.end ?? event.start)
      return eventEnd > visibleRange.start && eventStart < visibleRange.end
    })
    const map = new Map<string, typeof inRange>()
    for (const e of inRange) {
      if (!e.start) continue
      const day = e.start.slice(0, 10)
      if (!map.has(day)) map.set(day, [])
      map.get(day)!.push(e)
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [sourceEvents, visibleRange])

  useEffect(() => {
    if (!dragContainer || isCollapsed || readOnly) return
    const draggable = new Draggable(dragContainer, {
      itemSelector: '.import-card',
      eventData: (el) => ({
        id: el.dataset.id,
        title: el.dataset.title,
        duration: el.dataset.duration,
        create: false,
      }),
    })
    return () => draggable.destroy()
  }, [dragContainer, isCollapsed, readOnly])

  return (
    <div className="imported-panel">
      <div className="imported-panel-header">
        <span className="imported-panel-title">Importierter Spielplan</span>
        <div className="event-type-legend" aria-label="Legende Event-Typen">
          {EVENT_TYPE_LEGEND_ITEMS.map((item) => (
            <span key={item.key} className="event-type-legend-item">
              <span aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </span>
          ))}
        </div>
        <span className="spacer" />
        <button className="btn sm" type="button" aria-pressed={isCompact} onClick={onToggleCompact}>
          {isCompact ? 'Erweitert' : 'Kompakt'}
        </button>
        <button
          className="btn sm"
          type="button"
          aria-expanded={!isCollapsed}
          onClick={onToggleCollapsed}
        >
          {isCollapsed ? 'Ausklappen' : 'Einklappen'}
        </button>
        {!readOnly && (
          <>
            <button className="btn sm" aria-label="Zurücksetzen der letzten Verschiebung" disabled={!canUndo} onClick={onUndo}>↶ Zurück</button>
            <button className="btn sm" aria-label="Wiederholen der letzten Verschiebung" disabled={!canRedo} onClick={onRedo}>↷ Wiederholen</button>
            <button
              className="btn sm"
              aria-label="Ausgewählte Karte auf Ursprungszeit zurücksetzen"
              disabled={!canResetSelected}
              onClick={onResetSelected}
            >
              Karte zurücksetzen
            </button>
          </>
        )}
      </div>
      {isCollapsed ? null : (
        <div className="imported-panel-body" ref={setDragContainer}>
          {grouped.length === 0 ? (
            <p className="muted imported-panel-empty-message">
              Keine importierten Events vorhanden.
            </p>
          ) : (
            grouped.map(([day, evs]) => (
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
                    const durationStr = formatDuration(durationMin)
                    const detail = getImportedEventDetail(e)
                    const title = appendDetail(getEventTypeIcon(e), detail)
                    const accessibleLabel = `${appendDetail(getEventTypeLabel(e), detail)}${team ? ` · ${team.name}` : ''}`
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
                        <span className="sr-only">{accessibleLabel}</span>
                        <span className="import-card-title" aria-hidden="true">{title}</span>
                        {team && <span className="import-card-team">{team.name}</span>}
                        {!readOnly && onDuplicate && (
                         <div className="import-card-actions">
                           <button
                             type="button"
                             className="import-card-action-btn"
                             title="Duplizieren"
                             aria-label="Duplizieren"
                             onClick={(ev) => { ev.stopPropagation(); void handleDuplicate(e.id!) }}
                           >⧉</button>
                         </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
