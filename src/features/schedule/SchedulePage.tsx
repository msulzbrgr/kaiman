import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { exportBackup, downloadBackup, type BackupFile } from '../../db/backup'
import type { Assignment, Person, Role, ScheduleEvent, Team } from '../../db/types'
import { getNonEmptyText } from '../../lib/text'
import FilterRail, { type TeamFilterOption } from './FilterRail'
import CalendarView, { type CalendarSyncTarget, type FcEvent } from './CalendarView'
import EventDrawer from './EventDrawer'
import ImportedEventsPanel from './ImportedEventsPanel'
import { getEventTypeIcon } from './eventTypePresentation'

// Drop the club prefix from the team name for compact agenda titles:
// "EHC Zuchwil Regio U9"/"…U12" -> "U9"/"U12"; anything else -> "U14".
function shortTeamLabel(name: string): string {
  const stripped = name.replace(/EHC Zuchwil Regio/gi, '').trim()
  return /U9|U12/i.test(stripped) ? stripped : 'U14'
}

const SLOT_BUFFER_MINUTES = 60
const MAX_TEAM_FILTER_REMARK_TEXT_LENGTH = 5

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

interface SplitSnapshot {
  id: string
  label: string
  backup: BackupFile
}

type TeamFilterEvent = {
  teamId: number
  remarks: string
}

type TeamFilterVariant = {
  id: string
  getValue: (event: TeamFilterEvent) => string | null
  isEnabled: (value: string) => boolean
  getLabel: (teamName: string, value: string) => string
}

const TEAM_FILTER_VARIANTS: TeamFilterVariant[] = [
  {
    id: 'remarks',
    getValue: (event) => getNonEmptyText(event.remarks),
    isEnabled: (value) => value.length <= MAX_TEAM_FILTER_REMARK_TEXT_LENGTH,
    getLabel: (teamName, value) => `${teamName} · ${value}`,
  },
]

function toSlotTime(totalMinutes: number): string {
  const clamped = Math.min(Math.max(totalMinutes, 0), 24 * 60)
  const hours = Math.floor(clamped / 60)
  const minutes = clamped % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`
}

function buildTeamFilterKey(teamId: number, variantId?: string, value?: string): string {
  return JSON.stringify([teamId, variantId ?? null, value ?? null])
}

function parseTeamFilterKey(filterKey: string): { teamId: number; variantId: string | null; value: string | null } | null {
  try {
    const value = JSON.parse(filterKey)
    if (!Array.isArray(value) || value.length !== 3) return null
    const [teamId, variantId, variantValue] = value
    if (!Number.isFinite(teamId)) return null
    if (variantId !== null && typeof variantId !== 'string') return null
    if (variantValue !== null && typeof variantValue !== 'string') return null
    return { teamId, variantId, value: variantValue }
  } catch {
    return null
  }
}

function getTeamIdFromFilterKey(filterKey: string): number | null {
  return parseTeamFilterKey(filterKey)?.teamId ?? null
}

function matchesTeamFilter(filterKey: string, event: TeamFilterEvent): boolean {
  const parsed = parseTeamFilterKey(filterKey)
  if (!parsed || parsed.teamId !== event.teamId) return false
  if (parsed.variantId === null || parsed.value === null) return true
  const variant = TEAM_FILTER_VARIANTS.find((candidate) => candidate.id === parsed.variantId)
  if (!variant || !variant.isEnabled(parsed.value)) return false
  const eventValue = variant.getValue(event)
  return eventValue !== null && variant.isEnabled(eventValue) && eventValue === parsed.value
}

function buildTeamFilters(events: ScheduleEvent[], teams: Team[]): TeamFilterOption[] {
  const variantOptionsByTeamId = new Map<number, Map<string, Set<string>>>()
  for (const event of events) {
    for (const variant of TEAM_FILTER_VARIANTS) {
      const value = variant.getValue(event)
      if (!value || !variant.isEnabled(value)) continue
      const optionsByVariant =
        variantOptionsByTeamId.get(event.teamId) ??
        (() => {
          const next = new Map<string, Set<string>>()
          variantOptionsByTeamId.set(event.teamId, next)
          return next
        })()
      const variantValues =
        optionsByVariant.get(variant.id) ??
        (() => {
          const next = new Set<string>()
          optionsByVariant.set(variant.id, next)
          return next
        })()
      variantValues.add(value)
    }
  }

  return teams.flatMap((team) => {
    const options: TeamFilterOption[] = [
      {
        key: buildTeamFilterKey(team.id!),
        label: team.name,
        color: team.color,
      },
    ]
    const optionsByVariant = variantOptionsByTeamId.get(team.id!) ?? new Map()
    for (const variant of TEAM_FILTER_VARIANTS) {
      const values = [...(optionsByVariant.get(variant.id) ?? [])].sort((a, b) => a.localeCompare(b))
      for (const value of values) {
        options.push({
          key: buildTeamFilterKey(team.id!, variant.id, value),
          label: variant.getLabel(team.name, value),
          color: team.color,
        })
      }
    }
    return options
  })
}

function buildPeopleByEvent(assignments: Assignment[]): Map<number, Set<number>> {
  const m = new Map<number, Set<number>>()
  for (const assignment of assignments) {
    if (!m.has(assignment.eventId)) m.set(assignment.eventId, new Set())
    m.get(assignment.eventId)!.add(assignment.personId)
  }
  return m
}

function buildAttendeeCountsByEvent(
  assignments: Assignment[],
  roleById: Map<number, Role>,
): Map<number, { playerCount: number; coachCount: number }> {
  const result = new Map<number, { playerCount: number; coachCount: number }>()
  for (const a of assignments) {
    const role = roleById.get(a.roleId)
    if (!role) continue
    const counts = result.get(a.eventId) ?? { playerCount: 0, coachCount: 0 }
    if (role.key === 'player') counts.playerCount++
    else if (role.key.includes('coach')) counts.coachCount++
    result.set(a.eventId, counts)
  }
  return result
}

function eventsOverlap(a: ScheduleEvent, b: ScheduleEvent): boolean {
  if (!a.start || !b.start) return false
  const aStart = new Date(a.start).getTime()
  const aEnd = a.end ? new Date(a.end).getTime() : aStart
  const bStart = new Date(b.start).getTime()
  const bEnd = b.end ? new Date(b.end).getTime() : bStart
  return aStart < bEnd && bStart < aEnd
}

function buildConflictsByEvent(
  events: ScheduleEvent[],
  peopleByEvent: Map<number, Set<number>>,
  personById: Map<number, Person>,
): Map<number, string[]> {
  const result = new Map<number, string[]>()
  const active = events.filter((e) => e.id !== undefined && e.start && e.status === 'active')
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i]
      const b = active[j]
      if (!eventsOverlap(a, b)) continue
      const aPeople = peopleByEvent.get(a.id!) ?? new Set<number>()
      const bPeople = peopleByEvent.get(b.id!) ?? new Set<number>()
      const sharedIds = [...aPeople].filter((id) => bPeople.has(id))
      if (sharedIds.length === 0) continue
      const names = sharedIds.map((id) => personById.get(id)?.displayName ?? `#${id}`)
      const aList = result.get(a.id!) ?? []
      const bList = result.get(b.id!) ?? []
      for (const name of names) {
        if (!aList.includes(name)) aList.push(name)
        if (!bList.includes(name)) bList.push(name)
      }
      result.set(a.id!, aList)
      result.set(b.id!, bList)
    }
  }
  return result
}

function buildFcEvents({
  events,
  teamById,
  peopleByEvent,
  selectedTeamFilters,
  selectedPeople,
  showTraining,
  showGame,
  combineAnd,
  attendeeCountsByEvent,
  conflictsByEvent,
}: {
  events: ScheduleEvent[]
  teamById: Map<number, Team>
  peopleByEvent: Map<number, Set<number>>
  selectedTeamFilters: Set<string>
  selectedPeople: Set<number>
  showTraining: boolean
  showGame: boolean
  combineAnd: boolean
  attendeeCountsByEvent: Map<number, { playerCount: number; coachCount: number }>
  conflictsByEvent: Map<number, string[]>
}): FcEvent[] {
  return events
    .filter((event) => event.start)
    .filter((event) => (event.type === 'training' ? showTraining : showGame))
    .filter((event) => {
      const teamActive = selectedTeamFilters.size > 0
      const personActive = selectedPeople.size > 0
      if (!teamActive && !personActive) return true
      const teamHit =
        teamActive && [...selectedTeamFilters].some((filterKey) => matchesTeamFilter(filterKey, event))
      const personHit =
        personActive && [...(peopleByEvent.get(event.id!) ?? [])].some((personId) => selectedPeople.has(personId))
      if (teamActive && personActive) return combineAnd ? teamHit && personHit : teamHit || personHit
      return teamActive ? teamHit : personHit
    })
    .map((event) => {
      const team = teamById.get(event.teamId)
      const detail = event.type === 'training' ? '' : event.opponent ? ` vs ${event.opponent}` : ''
      const teamLabel = team ? shortTeamLabel(team.name) : '?'
      const title = `${getEventTypeIcon(event)} ${teamLabel}${detail}`
      const counts = attendeeCountsByEvent.get(event.id!)
      const conflicts = conflictsByEvent.get(event.id!) ?? []
      return {
        id: String(event.id),
        title: event.status === 'cancelled' ? `[Entfällt] ${title}` : title,
        start: event.start!,
        end: event.end ?? undefined,
        remarks: getNonEmptyText(event.remarks) ?? undefined,
        color: team?.color ?? '#2563eb',
        cancelled: event.status === 'cancelled',
        playerCount: counts?.playerCount,
        coachCount: counts?.coachCount,
        conflictingPeople: conflicts.length > 0 ? conflicts : undefined,
      }
    })
}

function computeSlotRange(fcEvents: FcEvent[], visibleRange: { start: Date; end: Date } | null): { min: string; max: string } {
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
}

function createSplitSnapshotLabel(): string {
  return `Stand ${new Date().toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
}

function eventDiffSignature(event: ScheduleEvent): string {
  return JSON.stringify([
    event.type,
    event.status,
    event.teamId,
    event.start,
    event.end,
    event.opponent,
    event.remarks,
    event.location,
    event.home,
  ])
}

function eventDiffKey(event: ScheduleEvent): string {
  return event.sourceKey || `manual:${event.id ?? 'unknown'}`
}

export default function SchedulePage() {
  const teams = useLiveQuery(() => db.teams.toArray(), [], [])
  const people = useLiveQuery(() => db.people.orderBy('displayName').toArray(), [], [])
  const events = useLiveQuery(() => db.events.toArray(), [], [])
  const assignments = useLiveQuery(() => db.assignments.toArray(), [], [])
  const roles = useLiveQuery(() => db.roles.toArray(), [], [])

  const [selectedTeamFilters, setSelectedTeamFilters] = useState<Set<string>>(new Set())
  const [selectedPeople, setSelectedPeople] = useState<Set<number>>(new Set())
  const [showTraining, setShowTraining] = useState(true)
  const [showGame, setShowGame] = useState(true)
  const [combineAnd, setCombineAnd] = useState(false)

  const [rightSelectedTeamFilters, setRightSelectedTeamFilters] = useState<Set<string>>(new Set())
  const [rightSelectedPeople, setRightSelectedPeople] = useState<Set<number>>(new Set())
  const [rightShowTraining, setRightShowTraining] = useState(true)
  const [rightShowGame, setRightShowGame] = useState(true)
  const [rightCombineAnd, setRightCombineAnd] = useState(false)

  const [openId, setOpenId] = useState<number | null>(null)
  const [selectedImportedEventId, setSelectedImportedEventId] = useState<number | null>(null)
  const [undoStack, setUndoStack] = useState<EventTimeChange[]>([])
  const [redoStack, setRedoStack] = useState<EventTimeChange[]>([])
  const [filterOpen, setFilterOpen] = useState(false)
  const [visibleRange, setVisibleRange] = useState<{ start: Date; end: Date } | null>(null)
  const [calendarSyncTarget, setCalendarSyncTarget] = useState<CalendarSyncTarget | null>(null)

  const [importedPanelCompact, setImportedPanelCompact] = useState(false)
  const [importedPanelCollapsed, setImportedPanelCollapsed] = useState(false)
  const [rightImportedPanelCompact, setRightImportedPanelCompact] = useState(false)
  const [rightImportedPanelCollapsed, setRightImportedPanelCollapsed] = useState(false)
  const [leftFilterCollapsed, setLeftFilterCollapsed] = useState(false)
  const [rightFilterCollapsed, setRightFilterCollapsed] = useState(false)
  const [splitToolbarCollapsed, setSplitToolbarCollapsed] = useState(false)

  const [splitOpen, setSplitOpen] = useState(false)
  const [splitSnapshots, setSplitSnapshots] = useState<SplitSnapshot[]>([])
  const [selectedSplitSnapshotId, setSelectedSplitSnapshotId] = useState<string | null>(null)
  const [splitDiffSummary, setSplitDiffSummary] = useState<string | null>(null)

  const importedPanelClassName = [
    'schedule-main-lower',
    !importedPanelCompact && !importedPanelCollapsed ? 'schedule-main-lower--expanded' : '',
    importedPanelCompact ? 'schedule-main-lower--compact' : '',
    importedPanelCollapsed ? 'schedule-main-lower--collapsed' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const rightImportedPanelClassName = [
    'schedule-main-lower',
    !rightImportedPanelCompact && !rightImportedPanelCollapsed ? 'schedule-main-lower--expanded' : '',
    rightImportedPanelCompact ? 'schedule-main-lower--compact' : '',
    rightImportedPanelCollapsed ? 'schedule-main-lower--collapsed' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const teamById = useMemo(() => new Map(teams.map((team) => [team.id!, team])), [teams])
  const eventById = useMemo(() => new Map(events.map((event) => [event.id!, event])), [events])
  const roleById = useMemo(() => new Map(roles.map((role) => [role.id!, role])), [roles])
  const personById = useMemo(() => new Map(people.map((person) => [person.id!, person])), [people])
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

  const peopleByEvent = useMemo(() => buildPeopleByEvent(assignments), [assignments])
  const attendeeCountsByEvent = useMemo(
    () => buildAttendeeCountsByEvent(assignments, roleById),
    [assignments, roleById],
  )
  const conflictsByEvent = useMemo(
    () => buildConflictsByEvent(events, peopleByEvent, personById),
    [events, peopleByEvent, personById],
  )

  const selectedSplitSnapshot = useMemo(
    () => splitSnapshots.find((snapshot) => snapshot.id === selectedSplitSnapshotId) ?? null,
    [splitSnapshots, selectedSplitSnapshotId],
  )

  const splitTeams = useMemo(() => {
    const rows = selectedSplitSnapshot?.backup.data.teams
    return (rows ?? []) as Team[]
  }, [selectedSplitSnapshot])

  const splitPeople = useMemo(() => {
    const rows = selectedSplitSnapshot?.backup.data.people
    return (rows ?? []) as Person[]
  }, [selectedSplitSnapshot])

  const splitEvents = useMemo(() => {
    const rows = selectedSplitSnapshot?.backup.data.events
    return (rows ?? []) as ScheduleEvent[]
  }, [selectedSplitSnapshot])

  const splitAssignments = useMemo(() => {
    const rows = selectedSplitSnapshot?.backup.data.assignments
    return (rows ?? []) as Assignment[]
  }, [selectedSplitSnapshot])

  const splitTeamById = useMemo(() => new Map(splitTeams.map((team) => [team.id!, team])), [splitTeams])
  const splitPeopleByEvent = useMemo(() => buildPeopleByEvent(splitAssignments), [splitAssignments])

  const splitRoles = useMemo(() => {
    const rows = selectedSplitSnapshot?.backup.data.roles
    return (rows ?? []) as Role[]
  }, [selectedSplitSnapshot])

  const splitRoleById = useMemo(
    () => new Map(splitRoles.map((role) => [role.id!, role])),
    [splitRoles],
  )

  const splitPersonById = useMemo(
    () => new Map(splitPeople.map((person) => [person.id!, person])),
    [splitPeople],
  )

  const splitAttendeeCountsByEvent = useMemo(
    () => buildAttendeeCountsByEvent(splitAssignments, splitRoleById),
    [splitAssignments, splitRoleById],
  )

  const splitConflictsByEvent = useMemo(
    () => buildConflictsByEvent(splitEvents, splitPeopleByEvent, splitPersonById),
    [splitEvents, splitPeopleByEvent, splitPersonById],
  )

  const teamFilters = useMemo(() => buildTeamFilters(events, teams), [events, teams])
  const rightTeamFilters = useMemo(() => buildTeamFilters(splitEvents, splitTeams), [splitEvents, splitTeams])

  const fcEvents = useMemo(
    () =>
      buildFcEvents({
        events,
        teamById,
        peopleByEvent,
        selectedTeamFilters,
        selectedPeople,
        showTraining,
        showGame,
        combineAnd,
        attendeeCountsByEvent,
        conflictsByEvent,
      }),
    [events, teamById, peopleByEvent, selectedTeamFilters, selectedPeople, showTraining, showGame, combineAnd, attendeeCountsByEvent, conflictsByEvent],
  )

  const rightFcEvents = useMemo(
    () =>
      buildFcEvents({
        events: splitEvents,
        teamById: splitTeamById,
        peopleByEvent: splitPeopleByEvent,
        selectedTeamFilters: rightSelectedTeamFilters,
        selectedPeople: rightSelectedPeople,
        showTraining: rightShowTraining,
        showGame: rightShowGame,
        combineAnd: rightCombineAnd,
        attendeeCountsByEvent: splitAttendeeCountsByEvent,
        conflictsByEvent: splitConflictsByEvent,
      }),
    [
      splitEvents,
      splitTeamById,
      splitPeopleByEvent,
      rightSelectedTeamFilters,
      rightSelectedPeople,
      rightShowTraining,
      rightShowGame,
      rightCombineAnd,
      splitAttendeeCountsByEvent,
      splitConflictsByEvent,
    ],
  )

  const slotRange = useMemo(
    () => computeSlotRange(splitOpen ? [...fcEvents, ...rightFcEvents] : fcEvents, visibleRange),
    [fcEvents, rightFcEvents, splitOpen, visibleRange],
  )

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

  async function saveSplitSnapshot(): Promise<void> {
    const backup = await exportBackup()
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `split-${Date.now()}`
    const snapshot: SplitSnapshot = {
      id,
      label: createSplitSnapshotLabel(),
      backup,
    }
    setSplitSnapshots((current) => [snapshot, ...current])
    setSelectedSplitSnapshotId(snapshot.id)
  }

  async function openSplitView(): Promise<void> {
    if (splitSnapshots.length === 0) {
      await saveSplitSnapshot()
    } else if (!selectedSplitSnapshotId) {
      setSelectedSplitSnapshotId(splitSnapshots[0].id)
    }
    setSplitOpen(true)
    setSplitDiffSummary(null)
  }

  function deleteSelectedSnapshot(): void {
    if (!selectedSplitSnapshotId) return
    if (!confirm('Gespeicherten Stand löschen?')) return
    setSplitSnapshots((current) => {
      const next = current.filter((snapshot) => snapshot.id !== selectedSplitSnapshotId)
      const nextSelected = next[0]?.id ?? null
      setSelectedSplitSnapshotId(nextSelected)
      if (next.length === 0) {
        setSplitOpen(false)
      }
      return next
    })
    setSplitDiffSummary(null)
  }

  function exportSelectedSnapshot(): void {
    if (!selectedSplitSnapshot) return
    downloadBackup(selectedSplitSnapshot.backup)
  }

  function diffSelectedSnapshotAgainstCurrent(): void {
    if (!selectedSplitSnapshot) return
    const snapshotEvents = (selectedSplitSnapshot.backup.data.events ?? []) as ScheduleEvent[]
    const currentByKey = new Map(events.map((event) => [eventDiffKey(event), event]))
    const snapshotByKey = new Map(snapshotEvents.map((event) => [eventDiffKey(event), event]))

    let added = 0
    let removed = 0
    let changed = 0

    for (const [key, currentEvent] of currentByKey) {
      const snapshotEvent = snapshotByKey.get(key)
      if (!snapshotEvent) {
        removed += 1
        continue
      }
      if (eventDiffSignature(currentEvent) !== eventDiffSignature(snapshotEvent)) {
        changed += 1
      }
    }

    for (const key of snapshotByKey.keys()) {
      if (!currentByKey.has(key)) {
        added += 1
      }
    }

    setSplitDiffSummary(`Neu: ${added} · Entfernt: ${removed} · Geändert: ${changed}`)
  }

  const leftPane = (
    <>
      <FilterRail
        side="left"
        teams={teams}
        teamFilters={teamFilters}
        people={people}
        selectedTeamFilters={selectedTeamFilters}
        selectedPeople={selectedPeople}
        showTraining={showTraining}
        showGame={showGame}
        combineAnd={combineAnd}
        mobileOpen={splitOpen ? false : filterOpen}
        collapsed={splitOpen ? leftFilterCollapsed : false}
        onToggleCollapsed={splitOpen ? () => setLeftFilterCollapsed((value) => !value) : undefined}
        onToggleTeamFilter={(key) => setSelectedTeamFilters((set) => toggle(set, key))}
        onTogglePerson={(id) => setSelectedPeople((set) => toggle(set, id))}
        onSetType={(kind, value) => (kind === 'training' ? setShowTraining(value) : setShowGame(value))}
        onSetCombine={setCombineAnd}
        onClear={() => {
          setSelectedTeamFilters(new Set())
          setSelectedPeople(new Set())
        }}
        onCreateEvent={createEvent}
        onMobileClose={() => setFilterOpen(false)}
      />
      {!splitOpen && filterOpen && (
        <div className="filter-rail-backdrop" onClick={() => setFilterOpen(false)} />
      )}
      <div className="schedule-main">
        <div className="schedule-mobile-bar">
          <button className="btn sm" onClick={() => setFilterOpen(true)}>☰ Filter</button>
          {(selectedTeamFilters.size > 0 || selectedPeople.size > 0) && (
            <span className="badge">{selectedTeamFilters.size + selectedPeople.size} aktiv</span>
          )}
          <span className="spacer" />
          <button className="btn sm" onClick={() => void openSplitView()}>Split-View</button>
          <button className="btn sm primary" onClick={createEvent}>+ Event</button>
        </div>
        {!splitOpen && (
          <div className="schedule-desktop-bar">
            <button className="btn sm" onClick={() => void openSplitView()}>Split-View</button>
          </div>
        )}
        {splitOpen && <div className="schedule-pane-header">Aktueller Stand</div>}
        <div className="schedule-main-upper">
          <CalendarView
            events={fcEvents}
            onSelect={setOpenId}
            slotMinTime={slotRange.min}
            slotMaxTime={slotRange.max}
            onVisibleRangeChange={setVisibleRange}
            onViewStateChange={setCalendarSyncTarget}
            editable
            droppable
            onEventDrop={handleEventUpdate}
            onEventResize={handleEventUpdate}
            onExternalDrop={handleExternalDrop}
          />
        </div>
        <div className={importedPanelClassName}>
          <ImportedEventsPanel
            onSelect={(id) => {
              setSelectedImportedEventId(id)
              setOpenId(id)
            }}
            selectedId={selectedImportedEventId}
            isCompact={importedPanelCompact}
            isCollapsed={importedPanelCollapsed}
            onToggleCompact={() => setImportedPanelCompact((value) => !value)}
            onToggleCollapsed={() => setImportedPanelCollapsed((value) => !value)}
            onUndo={undoMove}
            onRedo={redoMove}
            onResetSelected={resetSelectedImportedCard}
            canUndo={undoStack.length > 0}
            canRedo={redoStack.length > 0}
            canResetSelected={canResetSelectedImportedEvent}
            onDuplicate={(newId) => setOpenId(newId)}
            visibleRange={visibleRange}
          />
        </div>
      </div>
    </>
  )

  const rightPane = splitOpen && selectedSplitSnapshot && (
    <>
      <div className="schedule-main">
        <div className="schedule-pane-header">{selectedSplitSnapshot.label}</div>
        <div className="schedule-main-upper">
          <CalendarView
            events={rightFcEvents}
            onSelect={() => undefined}
            slotMinTime={slotRange.min}
            slotMaxTime={slotRange.max}
            onVisibleRangeChange={() => undefined}
            showToolbar={false}
            syncTarget={calendarSyncTarget}
          />
        </div>
        <div className={rightImportedPanelClassName}>
          <ImportedEventsPanel
            onSelect={() => undefined}
            selectedId={null}
            isCompact={rightImportedPanelCompact}
            isCollapsed={rightImportedPanelCollapsed}
            onToggleCompact={() => setRightImportedPanelCompact((value) => !value)}
            onToggleCollapsed={() => setRightImportedPanelCollapsed((value) => !value)}
            onUndo={() => undefined}
            onRedo={() => undefined}
            onResetSelected={() => undefined}
            canUndo={false}
            canRedo={false}
            canResetSelected={false}
            eventsData={splitEvents}
            teamsData={splitTeams}
            visibleRange={visibleRange}
            readOnly
          />
        </div>
      </div>
      <FilterRail
        side="right"
        teams={splitTeams}
        teamFilters={rightTeamFilters}
        people={splitPeople}
        selectedTeamFilters={rightSelectedTeamFilters}
        selectedPeople={rightSelectedPeople}
        showTraining={rightShowTraining}
        showGame={rightShowGame}
        combineAnd={rightCombineAnd}
        mobileOpen={false}
        collapsed={rightFilterCollapsed}
        onToggleCollapsed={() => setRightFilterCollapsed((value) => !value)}
        onToggleTeamFilter={(key) => setRightSelectedTeamFilters((set) => toggle(set, key))}
        onTogglePerson={(id) => setRightSelectedPeople((set) => toggle(set, id))}
        onSetType={(kind, value) =>
          kind === 'training' ? setRightShowTraining(value) : setRightShowGame(value)
        }
        onSetCombine={setRightCombineAnd}
        onClear={() => {
          setRightSelectedTeamFilters(new Set())
          setRightSelectedPeople(new Set())
        }}
        onMobileClose={() => undefined}
      />
    </>
  )

  return (
    <div className={`schedule${splitOpen ? ' schedule--split' : ''}`}>
      {splitOpen ? (
        <>
          <div className={`schedule-split-toolbar${splitToolbarCollapsed ? ' schedule-split-toolbar--collapsed' : ''}`}>
            <div className="schedule-split-toolbar-header">
              <div className="schedule-split-toolbar-title-group">
                <span className="schedule-split-toolbar-title">Split-View</span>
                {splitDiffSummary && <span className="muted">{splitDiffSummary}</span>}
              </div>
              <button
                className="btn sm"
                type="button"
                aria-expanded={!splitToolbarCollapsed}
                aria-label={splitToolbarCollapsed ? 'Split-View-Steuerung ausklappen' : 'Split-View-Steuerung einklappen'}
                onClick={() => setSplitToolbarCollapsed((value) => !value)}
              >
                {splitToolbarCollapsed ? '▸' : '▾'}
              </button>
            </div>
            {!splitToolbarCollapsed && (
              <div className="schedule-split-toolbar-actions">
                <button className="btn sm" onClick={() => setSplitOpen(false)}>Split-View schließen</button>
                <button className="btn sm" onClick={() => void saveSplitSnapshot()}>Stand speichern</button>
                <label className="schedule-split-select-wrap">
                  <span className="muted">Stand:</span>
                  <select
                    className="schedule-split-select"
                    value={selectedSplitSnapshotId ?? ''}
                    onChange={(event) => {
                      setSelectedSplitSnapshotId(event.target.value)
                      setSplitDiffSummary(null)
                    }}
                  >
                    {splitSnapshots.map((snapshot) => (
                      <option key={snapshot.id} value={snapshot.id}>{snapshot.label}</option>
                    ))}
                  </select>
                </label>
                <button className="btn sm" onClick={diffSelectedSnapshotAgainstCurrent}>Differenz</button>
                <button className="btn sm" onClick={exportSelectedSnapshot}>Export</button>
                <button className="btn sm danger" onClick={deleteSelectedSnapshot}>Löschen</button>
              </div>
            )}
          </div>
          <div className="schedule-split-body">
            <div className="schedule-split-pane schedule-split-pane--left">{leftPane}</div>
            <div className="schedule-split-pane schedule-split-pane--right">{rightPane}</div>
          </div>
        </>
      ) : (
        leftPane
      )}
      {openId != null && (
        <EventDrawer
          eventId={openId}
          onClose={() => setOpenId(null)}
          onDuplicate={(newId) => setOpenId(newId)}
        />
      )}
    </div>
  )
}
