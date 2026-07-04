import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import FilterRail, { type TeamFilterOption } from './FilterRail'
import CalendarView, { type FcEvent } from './CalendarView'
import EventDrawer from './EventDrawer'
import ImportedEventsPanel from './ImportedEventsPanel'

// Drop the club prefix from the team name for compact agenda titles:
// "EHC Zuchwil Regio U9"/"…U12" -> "U9"/"U12"; anything else -> "U14".
function shortTeamLabel(name: string): string {
  const stripped = name.replace(/EHC Zuchwil Regio/gi, '').trim()
  return /U9|U12/i.test(stripped) ? stripped : 'U14'
}

const SLOT_BUFFER_MINUTES = 60
const TEAM_FILTER_SEPARATOR = '::'
interface EventTimeChange {
  eventId: number
  beforeStart: string | null
  beforeEnd: string | null
  afterStart: string | null
  afterEnd: string | null
}

interface EventTimePatch {
  start: string | null
  end: string | null
  originalStart?: string | null
  originalEnd?: string | null
}

function toSlotTime(totalMinutes: number): string {
  const clamped = Math.min(Math.max(totalMinutes, 0), 24 * 60)
  const hours = Math.floor(clamped / 60)
  const minutes = clamped % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`
}

function getFilterableRemark(remarks: string): string | null {
  const trimmed = remarks.trim()
  return trimmed.length > 0 && trimmed.length < 6 ? trimmed : null
}

function buildTeamFilterKey(teamId: number, remark?: string): string {
  return remark ? `${teamId}${TEAM_FILTER_SEPARATOR}${remark}` : String(teamId)
}

function getTeamIdFromFilterKey(filterKey: string): number | null {
  const [teamId] = filterKey.split(TEAM_FILTER_SEPARATOR, 1)
  if (!teamId) return null
  const parsed = Number(teamId)
  return Number.isFinite(parsed) ? parsed : null
}

function matchesTeamFilter(filterKey: string, event: { teamId: number; remarks: string }): boolean {
  const [teamIdPart, remark] = filterKey.split(TEAM_FILTER_SEPARATOR)
  if (Number(teamIdPart) !== event.teamId) return false
  return remark == null ? true : getFilterableRemark(event.remarks) === remark
}

export default function SchedulePage() {
  const teams = useLiveQuery(() => db.teams.toArray(), [], [])
  const people = useLiveQuery(() => db.people.orderBy('displayName').toArray(), [], [])
  const events = useLiveQuery(() => db.events.toArray(), [], [])
  const assignments = useLiveQuery(() => db.assignments.toArray(), [], [])

  const [selectedTeamFilters, setSelectedTeamFilters] = useState<Set<string>>(new Set())
  const [selectedPeople, setSelectedPeople] = useState<Set<number>>(new Set())
  const [showTraining, setShowTraining] = useState(true)
  const [showGame, setShowGame] = useState(true)
  const [combineAnd, setCombineAnd] = useState(false)
  const [openId, setOpenId] = useState<number | null>(null)
  const [selectedImportedEventId, setSelectedImportedEventId] = useState<number | null>(null)
  const [undoStack, setUndoStack] = useState<EventTimeChange[]>([])
  const [redoStack, setRedoStack] = useState<EventTimeChange[]>([])
  const [filterOpen, setFilterOpen] = useState(false)
  const [visibleRange, setVisibleRange] = useState<{ start: Date; end: Date } | null>(null)

  const teamById = useMemo(() => new Map(teams.map((t) => [t.id!, t])), [teams])
  const eventById = useMemo(() => new Map(events.map((event) => [event.id!, event])), [events])
  const selectedImportedEvent =
    selectedImportedEventId == null ? null : eventById.get(selectedImportedEventId) ?? null
  const canResetSelectedImportedEvent =
    !!selectedImportedEvent &&
    selectedImportedEvent.sourceId !== null &&
    selectedImportedEvent.originalStart != null &&
    (selectedImportedEvent.start !== selectedImportedEvent.originalStart ||
      selectedImportedEvent.end !== selectedImportedEvent.originalEnd)

  useEffect(() => {
    const missingBaseline = events.filter(
      (event) => event.sourceId !== null && event.originalStart == null && event.start,
    )
    if (missingBaseline.length === 0) return
    void db.transaction('rw', db.events, async () => {
      for (const event of missingBaseline) {
        await db.events.update(event.id!, {
          originalStart: event.start,
          originalEnd: event.end,
        })
      }
    })
  }, [events])

  // eventId -> set of personIds assigned
  const peopleByEvent = useMemo(() => {
    const m = new Map<number, Set<number>>()
    for (const a of assignments) {
      if (!m.has(a.eventId)) m.set(a.eventId, new Set())
      m.get(a.eventId)!.add(a.personId)
    }
    return m
  }, [assignments])

  const teamFilters = useMemo<TeamFilterOption[]>(() => {
    const remarkOptionsByTeamId = new Map<number, Set<string>>()
    for (const event of events) {
      const remark = getFilterableRemark(event.remarks)
      if (!remark) continue
      if (!remarkOptionsByTeamId.has(event.teamId)) {
        remarkOptionsByTeamId.set(event.teamId, new Set())
      }
      remarkOptionsByTeamId.get(event.teamId)!.add(remark)
    }

    return teams.flatMap((team) => {
      const options: TeamFilterOption[] = [
        {
          key: buildTeamFilterKey(team.id!),
          label: team.name,
          color: team.color,
        },
      ]
      const remarks = [...(remarkOptionsByTeamId.get(team.id!) ?? [])].sort((a, b) => a.localeCompare(b))
      for (const remark of remarks) {
        options.push({
          key: buildTeamFilterKey(team.id!, remark),
          label: `${team.name} · ${remark}`,
          color: team.color,
        })
      }
      return options
    })
  }, [events, teams])

  const fcEvents: FcEvent[] = useMemo(() => {
    return events
      .filter((e) => e.start)
      .filter((e) => (e.type === 'training' ? showTraining : showGame))
      .filter((e) => {
        const teamActive = selectedTeamFilters.size > 0
        const personActive = selectedPeople.size > 0
        if (!teamActive && !personActive) return true
        const teamHit =
          teamActive && [...selectedTeamFilters].some((filterKey) => matchesTeamFilter(filterKey, e))
        const personHit =
          personActive &&
          [...(peopleByEvent.get(e.id!) ?? [])].some((pid) => selectedPeople.has(pid))
        if (teamActive && personActive) return combineAnd ? teamHit && personHit : teamHit || personHit
        return teamActive ? teamHit : personHit
      })
      .map((e) => {
        const team = teamById.get(e.teamId)
        const typeLabel = e.type === 'game' ? (e.home ? 'Spiel' : 'Spiel (A)') : 'Training'
        const detail =
          e.type === 'training'
            ? e.art ? ` · ${e.art}` : ''
            : e.opponent ? ` vs ${e.opponent}` : ''
        const teamLabel = team ? shortTeamLabel(team.name) : '?'
        const remark = getFilterableRemark(e.remarks ?? '')
        const desc = remark ? ` · ${remark}` : ''
        const prefix = e.type === 'training' ? '' : `${typeLabel} · `
        const title = `${prefix}${teamLabel}${detail}${desc}`
        return {
          id: String(e.id),
          title: e.status === 'cancelled' ? `[Entfällt] ${title}` : title,
          start: e.start!,
          end: e.end ?? undefined,
          color: team?.color ?? '#2563eb',
          cancelled: e.status === 'cancelled',
        }
      })
  }, [events, peopleByEvent, teamById, selectedTeamFilters, selectedPeople, showTraining, showGame, combineAnd])

  const slotRange = useMemo(() => {
    const eventsInRange =
      visibleRange === null
        ? fcEvents
        : fcEvents.filter((event) => {
            const eventStart = new Date(event.start)
            const eventEnd = new Date(event.end ?? event.start)
            return eventEnd > visibleRange.start && eventStart < visibleRange.end
          })

    if (eventsInRange.length === 0) return { min: '06:00:00', max: '23:00:00' }

    let firstStart = Number.POSITIVE_INFINITY
    let lastEnd = Number.NEGATIVE_INFINITY
    let hasOvernightEvent = false

    for (const event of eventsInRange) {
      const start = new Date(event.start)
      const end = new Date(event.end ?? event.start)
      if (start.toDateString() !== end.toDateString()) {
        hasOvernightEvent = true
        break
      }

      const startMinutes = start.getHours() * 60 + start.getMinutes()
      const endMinutes = end.getHours() * 60 + end.getMinutes()

      firstStart = Math.min(firstStart, startMinutes)
      lastEnd = Math.max(lastEnd, endMinutes)
    }

    if (hasOvernightEvent) return { min: '00:00:00', max: '24:00:00' }

    return {
      min: toSlotTime(firstStart - SLOT_BUFFER_MINUTES),
      max: toSlotTime(lastEnd + SLOT_BUFFER_MINUTES),
    }
  }, [fcEvents, visibleRange])

  const toggle = <T,>(set: Set<T>, value: T) => {
    const next = new Set(set)
    next.has(value) ? next.delete(value) : next.add(value)
    return next
  }

  async function handleEventUpdate(eventId: number, start: Date, end: Date | null) {
    await updateEventTimeWithHistory(eventId, start.toISOString(), end ? end.toISOString() : null)
    const event = eventById.get(eventId)
    if (event?.sourceId != null) {
      setSelectedImportedEventId(eventId)
    }
  }

  async function handleExternalDrop(draggedEl: HTMLElement, newStart: Date) {
    const eventId = Number(draggedEl.dataset.id)
    if (!eventId) return
    const event = await db.events.get(eventId)
    if (!event?.start) return
    const oldStart = new Date(event.start)
    const oldEnd = event.end ? new Date(event.end) : null
    const durationMs = oldEnd ? oldEnd.getTime() - oldStart.getTime() : 0
    const newEnd = durationMs > 0 ? new Date(newStart.getTime() + durationMs) : null
    await updateEventTimeWithHistory(
      eventId,
      newStart.toISOString(),
      newEnd ? newEnd.toISOString() : event.end,
    )
    if (event.sourceId != null) {
      setSelectedImportedEventId(eventId)
    }
  }

  async function updateEventTimeWithHistory(
    eventId: number,
    nextStart: string | null,
    nextEnd: string | null,
  ): Promise<void> {
    const current = await db.events.get(eventId)
    if (!current) return
    const beforeStart = current.start
    const beforeEnd = current.end
    if (beforeStart === nextStart && beforeEnd === nextEnd) return

    const patch: EventTimePatch = {
      start: nextStart,
      end: nextEnd,
    }
    if (current.sourceId !== null && current.originalStart == null && current.start) {
      patch.originalStart = current.start
      patch.originalEnd = current.end
    }
    await db.events.update(eventId, patch)

    setUndoStack((stack) => [
      ...stack,
      { eventId, beforeStart, beforeEnd, afterStart: nextStart, afterEnd: nextEnd },
    ])
    setRedoStack([])
  }

  async function undoMove() {
    const change = undoStack[undoStack.length - 1]
    if (!change) return
    await db.events.update(change.eventId, {
      start: change.beforeStart,
      end: change.beforeEnd,
    })
    setUndoStack((stack) => stack.slice(0, -1))
    setRedoStack((stack) => [...stack, change])
  }

  async function redoMove() {
    const change = redoStack[redoStack.length - 1]
    if (!change) return
    await db.events.update(change.eventId, {
      start: change.afterStart,
      end: change.afterEnd,
    })
    setRedoStack((stack) => stack.slice(0, -1))
    setUndoStack((stack) => [...stack, change])
  }

  async function resetSelectedImportedCard() {
    if (
      !selectedImportedEvent ||
      selectedImportedEvent.sourceId === null ||
      selectedImportedEvent.originalStart == null
    ) return

    await updateEventTimeWithHistory(
      selectedImportedEvent.id!,
      selectedImportedEvent.originalStart,
      selectedImportedEvent.originalEnd,
    )
  }

  async function createEvent() {
    const teamId = getTeamIdFromFilterKey([...selectedTeamFilters][0] ?? '') ?? teams[0]?.id
    if (!teamId) {
      alert('Bitte zuerst ein Team anlegen oder importieren.')
      return
    }
    const start = new Date()
    start.setHours(18, 0, 0, 0)
    const end = new Date(start.getTime() + 90 * 60 * 1000)
    const id = await db.events.add({
      sourceId: null,
      sourceKey: 'manual-' + start.toISOString(),
      originalStart: null,
      originalEnd: null,
      teamId,
      type: 'training',
      art: '',
      opponent: '',
      home: true,
      location: '',
      meetingPoint: '',
      departure: '',
      start: start.toISOString(),
      end: end.toISOString(),
      remarks: '',
      status: 'active',
      manual: true,
    })
    setOpenId(id)
  }

  return (
    <div className="schedule">
      <FilterRail
        teams={teams}
        teamFilters={teamFilters}
        people={people}
        selectedTeamFilters={selectedTeamFilters}
        selectedPeople={selectedPeople}
        showTraining={showTraining}
        showGame={showGame}
        combineAnd={combineAnd}
        mobileOpen={filterOpen}
        onToggleTeamFilter={(key) => setSelectedTeamFilters((s) => toggle(s, key))}
        onTogglePerson={(id) => setSelectedPeople((s) => toggle(s, id))}
        onSetType={(k, v) => (k === 'training' ? setShowTraining(v) : setShowGame(v))}
        onSetCombine={setCombineAnd}
        onClear={() => {
          setSelectedTeamFilters(new Set())
          setSelectedPeople(new Set())
        }}
        onCreateEvent={createEvent}
        onMobileClose={() => setFilterOpen(false)}
      />
      {filterOpen && (
        <div className="filter-rail-backdrop" onClick={() => setFilterOpen(false)} />
      )}
      <div className="schedule-main">
        <div className="schedule-mobile-bar">
          <button className="btn sm" onClick={() => setFilterOpen(true)}>☰ Filter</button>
        {(selectedTeamFilters.size > 0 || selectedPeople.size > 0) && (
          <span className="badge">{selectedTeamFilters.size + selectedPeople.size} aktiv</span>
          )}
          <span className="spacer" />
          <button className="btn sm primary" onClick={createEvent}>+ Event</button>
        </div>
        <div className="schedule-main-upper">
          <CalendarView
            events={fcEvents}
            onSelect={setOpenId}
            slotMinTime={slotRange.min}
            slotMaxTime={slotRange.max}
            onVisibleRangeChange={setVisibleRange}
            editable
            droppable
            onEventDrop={handleEventUpdate}
            onEventResize={handleEventUpdate}
            onExternalDrop={handleExternalDrop}
          />
        </div>
        <div className="schedule-main-lower">
          <ImportedEventsPanel
            onSelect={(id) => {
              setSelectedImportedEventId(id)
              setOpenId(id)
            }}
            selectedId={selectedImportedEventId}
            onUndo={undoMove}
            onRedo={redoMove}
            onResetSelected={resetSelectedImportedCard}
            canUndo={undoStack.length > 0}
            canRedo={redoStack.length > 0}
            canResetSelected={canResetSelectedImportedEvent}
          />
        </div>
      </div>
      {openId != null && <EventDrawer eventId={openId} onClose={() => setOpenId(null)} />}
    </div>
  )
}
