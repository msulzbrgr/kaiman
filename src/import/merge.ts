import { db, roleIdByKey } from '../db/db'
import {
  addAssignment,
  addRosterMember,
  getOrCreatePerson,
  getOrCreateTeam,
} from '../db/repo'
import { fmtDate, fmtTime } from '../lib/dateParse'
import { ageGroupHint, normKey } from '../lib/normalize'
import {
  IMPORT_HELPER_ROLE,
  IMPORT_STAFF_ROLE,
  type ScheduleEvent,
} from '../db/types'
import type { ImportResult, ParsedEvent } from './SourceImporter'

export interface ImportPreview {
  fileName: string
  total: number
  newEvents: number
  updatedEvents: number
  cancelledEvents: number
  newTeams: string[]
  newPeople: string[]
  reusingSource: boolean
  unmatchedEntries: string[]
}

async function findSource(kind: string, fileName: string) {
  return db.sources.filter((s) => s.kind === kind && s.fileName === fileName).first()
}

export async function previewImport(
  result: ImportResult,
  kind: string,
  fileName: string,
): Promise<ImportPreview> {
  if (result.mode === 'practice-update') return previewPracticeUpdateImport(result, kind, fileName)

  const source = await findSource(kind, fileName)
  const existing = source?.id
    ? await db.events.where('sourceId').equals(source.id).toArray()
    : []
  const existingKeys = new Set(existing.map((e) => e.sourceKey))
  const incomingKeys = new Set(result.events.map((e) => e.sourceKey))

  let newEvents = 0
  let updatedEvents = 0
  for (const ev of result.events) {
    if (existingKeys.has(ev.sourceKey)) updatedEvents++
    else newEvents++
  }
  const cancelledEvents = existing.filter(
    (e) => e.status === 'active' && !incomingKeys.has(e.sourceKey),
  ).length

  const newTeams: string[] = []
  for (const name of result.teamNames) {
    const t = await db.teams.get({ nameKey: normKey(name) })
    if (!t) newTeams.push(name)
  }
  const newPeople: string[] = []
  for (const name of result.peopleNames) {
    const p = await db.people.get({ nameKey: normKey(name) })
    if (!p) newPeople.push(name)
  }

  return {
    fileName,
    total: result.events.length,
    newEvents,
    updatedEvents,
    cancelledEvents,
    newTeams,
    newPeople,
    reusingSource: !!source,
    unmatchedEntries: [],
  }
}

const SCHEDULE_FIELDS = [
  'type',
  'art',
  'opponent',
  'home',
  'location',
  'meetingPoint',
  'departure',
  'start',
  'end',
  'remarks',
  'ageGroup',
] as const satisfies readonly (keyof ScheduleEvent)[]

export async function commitImport(
  result: ImportResult,
  kind: string,
  label: string,
  fileName: string,
): Promise<{ sourceId: number }> {
  if (result.mode === 'practice-update') return commitPracticeUpdateImport(result, kind, label, fileName)

  const staffRoleId = (await roleIdByKey(IMPORT_STAFF_ROLE))!
  const helperRoleId = (await roleIdByKey(IMPORT_HELPER_ROLE))!

  // Reuse a same-named source so re-imports merge instead of duplicating.
  const existingSource = await findSource(kind, fileName)
  const importedAt = new Date().toISOString()
  let sourceId: number
  if (existingSource?.id) {
    sourceId = existingSource.id
    await db.sources.update(sourceId, { importedAt, label })
  } else {
    sourceId = await db.sources.add({ kind, label, fileName, importedAt })
  }

  const seenKeys = new Set<string>()

  for (const ev of result.events) {
    seenKeys.add(ev.sourceKey)
    const teamId = await getOrCreateTeam(ev.teamName)
    const eventId = await upsertEvent(sourceId, teamId, ev)

    // Resolve people; add to roster + assignment with default role.
    for (const p of ev.staff) {
      const personId = await getOrCreatePerson(p.displayName)
      await addRosterMember(teamId, personId, staffRoleId)
      await addAssignment(eventId, personId, staffRoleId)
    }
    for (const p of ev.helpers) {
      const personId = await getOrCreatePerson(p.displayName)
      await addRosterMember(teamId, personId, helperRoleId)
      await addAssignment(eventId, personId, helperRoleId)
    }
  }

  // Flag events that were previously imported from this source but are gone now.
  const all = await db.events.where('sourceId').equals(sourceId).toArray()
  for (const e of all) {
    if (!seenKeys.has(e.sourceKey) && e.status === 'active') {
      await db.events.update(e.id!, { status: 'cancelled' })
    }
  }

  return { sourceId }
}

async function previewPracticeUpdateImport(
  result: ImportResult,
  kind: string,
  fileName: string,
): Promise<ImportPreview> {
  const source = await findSource(kind, fileName)
  const matchContext = await loadPracticeMatchContext()
  const unmatchedEntries: string[] = []
  let updatedEvents = 0

for (const ev of result.events) {
  const match = findPracticeMatch(ev, matchContext)
  if (!match.ok) {
    unmatchedEntries.push(formatPracticeEntryLabel(ev, match.reason))
    continue
  }
  if (typeof ev.availablePlayerCount === 'number' || typeof ev.possiblePlayerCount === 'number') {
    updatedEvents += 1
  }
}

  return {
    fileName,
    total: result.events.length,
    newEvents: 0,
    updatedEvents,
    cancelledEvents: 0,
    newTeams: [],
    newPeople: [],
    reusingSource: !!source,
    unmatchedEntries,
  }
}

async function commitPracticeUpdateImport(
  result: ImportResult,
  kind: string,
  label: string,
  fileName: string,
): Promise<{ sourceId: number }> {
  return db.transaction('rw', db.sources, db.events, db.teams, async () => {
    const existingSource = await findSource(kind, fileName)
    const importedAt = new Date().toISOString()
    let sourceId: number
    if (existingSource?.id) {
      sourceId = existingSource.id
      await db.sources.update(sourceId, { importedAt, label })
    } else {
      sourceId = await db.sources.add({ kind, label, fileName, importedAt })
    }

    const matchContext = await loadPracticeMatchContext()
    for (const ev of result.events) {
      const match = findPracticeMatch(ev, matchContext)
      if (!match.ok) continue
      const patch: Partial<ScheduleEvent> = {}
      if (typeof ev.availablePlayerCount === 'number') {
        patch.availablePlayerCount = ev.availablePlayerCount
      }
      if (typeof ev.possiblePlayerCount === 'number') {
        patch.possiblePlayerCount = ev.possiblePlayerCount
      }
      if (Object.keys(patch).length > 0) {
        await db.events.update(match.event.id!, patch)
      }
    }

    return { sourceId }
  })
}

interface PracticeMatchContext {
  eventsByStart: Map<string, ScheduleEvent[]>
  teamById: Map<number, { name: string; nameKey: string; ageGroupKey: string }>
}

async function loadPracticeMatchContext(): Promise<PracticeMatchContext> {
  const [events, teams] = await Promise.all([db.events.toArray(), db.teams.toArray()])
  const teamById = new Map(
    teams.map((team) => [
      team.id!,
      {
        name: team.name,
        nameKey: normKey(team.name),
        ageGroupKey: normKey(team.ageGroup || ageGroupHint(team.name)),
      },
    ]),
  )
  const eventsByStart = new Map<string, ScheduleEvent[]>()
  for (const event of events) {
    const start = event.start
    if (!start) continue
    const bucket = eventsByStart.get(start)
    if (bucket) bucket.push(event)
    else eventsByStart.set(start, [event])
  }
  return { eventsByStart, teamById }
}

function matchesGroup(
  event: ScheduleEvent,
  parsedTeamKey: string,
  parsedAgeGroupKey: string,
  context: PracticeMatchContext,
): boolean {
  const team = context.teamById.get(event.teamId)
  if (!team) return false
  if (parsedTeamKey && parsedAgeGroupKey) {
    if (parsedTeamKey !== team.nameKey) return false
    // Accept when the ageGroup matches the team's derived key, OR the raw ageGroup
    // stored on the event (which may differ, e.g. "Erfassungsstufe" vs "U12").
    const eventAgeGroupKey = normKey(event.ageGroup || '')
    return (
      parsedAgeGroupKey === team.ageGroupKey ||
      (eventAgeGroupKey !== '' && parsedAgeGroupKey === eventAgeGroupKey)
    )
  }
  if (parsedTeamKey) return parsedTeamKey === team.nameKey
  if (parsedAgeGroupKey) return parsedAgeGroupKey === team.ageGroupKey
  return false
}

function findPracticeMatch(
  parsed: ParsedEvent,
  context: PracticeMatchContext,
): { ok: true; event: ScheduleEvent } | { ok: false; reason: string } {
  if (!parsed.start) return { ok: false, reason: 'ohne Startzeit' }
  const parsedTeamKey = normKey(parsed.teamName || '')
  const parsedAgeGroupKey = normKey(parsed.ageGroup || '')
  const startCandidates = context.eventsByStart.get(parsed.start) ?? []
  const candidates = startCandidates.filter(
    (event) =>
      event.id !== undefined &&
      matchesGroup(event, parsedTeamKey, parsedAgeGroupKey, context),
  )
  if (candidates.length === 0) return { ok: false, reason: 'kein Treffer' }
  if (candidates.length === 1) return { ok: true, event: candidates[0] }

  const endMatched = candidates.filter((event) => event.end === parsed.end)
  if (endMatched.length === 1) return { ok: true, event: endMatched[0] }
  return { ok: false, reason: 'mehrdeutiger Treffer' }
}

function formatPracticeEntryLabel(ev: ParsedEvent, reason: string): string {
  const teamOrGroup = ev.teamName || ev.ageGroup || 'ohne Gruppe'
  const start = ev.start ? `${fmtDate(ev.start)} ${fmtTime(ev.start)}` : '(keine Zeit)'
  return `${start} · ${teamOrGroup} (${reason})`
}

async function upsertEvent(
  sourceId: number,
  teamId: number,
  ev: ParsedEvent,
): Promise<number> {
  const existing = await db.events
    .where('[sourceId+sourceKey]')
    .equals([sourceId, ev.sourceKey])
    .first()

  const fields = {} as Pick<ScheduleEvent, (typeof SCHEDULE_FIELDS)[number]>
  for (const f of SCHEDULE_FIELDS) {
    ;(fields as any)[f] = (ev as any)[f]
  }

  if (existing?.id) {
    // Update schedule fields, re-activate, keep team + manual assignments.
    await db.events.update(existing.id, {
      ...fields,
      teamId,
      status: 'active',
      originalStart: ev.start,
      originalEnd: ev.end,
    })
    return existing.id
  }
  return db.events.add({
    sourceId,
    sourceKey: ev.sourceKey,
    originalStart: ev.start,
    originalEnd: ev.end,
    teamId,
    status: 'active',
    manual: false,
    ...fields,
  } as ScheduleEvent)
}
