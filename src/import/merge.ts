import { db, roleIdByKey } from '../db/db'
import {
  addAssignment,
  addRosterMember,
  getOrCreatePerson,
  getOrCreateTeam,
} from '../db/repo'
import { normKey } from '../lib/normalize'
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
}

async function findSource(kind: string, fileName: string) {
  return db.sources.filter((s) => s.kind === kind && s.fileName === fileName).first()
}

export async function previewImport(
  result: ImportResult,
  kind: string,
  fileName: string,
): Promise<ImportPreview> {
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
  }
}

const SCHEDULE_FIELDS: (keyof ScheduleEvent)[] = [
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
]

export async function commitImport(
  result: ImportResult,
  kind: string,
  label: string,
  fileName: string,
): Promise<{ sourceId: number }> {
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

async function upsertEvent(
  sourceId: number,
  teamId: number,
  ev: ParsedEvent,
): Promise<number> {
  const existing = await db.events
    .where('[sourceId+sourceKey]')
    .equals([sourceId, ev.sourceKey])
    .first()

  const fields: Partial<ScheduleEvent> = {}
  for (const f of SCHEDULE_FIELDS) {
    ;(fields as any)[f] = (ev as any)[f]
  }

  if (existing?.id) {
    // Update schedule fields, re-activate, keep team + manual assignments.
    await db.events.update(existing.id, { ...fields, teamId, status: 'active' })
    return existing.id
  }
  return db.events.add({
    sourceId,
    sourceKey: ev.sourceKey,
    teamId,
    status: 'active',
    manual: false,
    ...(fields as Omit<ScheduleEvent, 'id' | 'sourceId' | 'sourceKey' | 'teamId' | 'status' | 'manual'>),
  } as ScheduleEvent)
}
