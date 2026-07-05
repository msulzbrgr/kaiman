import { db } from './db'
import { ageGroupHint, cleanText, normKey, teamColor } from '../lib/normalize'
import { parsePersonName } from '../lib/nameParse'
import type { Person, Team } from './types'

/** Find a team by normalized name or create it. */
export async function getOrCreateTeam(name: string): Promise<number> {
  const clean = cleanText(name)
  const key = normKey(clean)
  const existing = await db.teams.get({ nameKey: key })
  if (existing?.id) return existing.id
  const count = await db.teams.count()
  const team: Team = {
    name: clean,
    nameKey: key,
    ageGroup: ageGroupHint(clean),
    color: teamColor(count),
  }
  return db.teams.add(team)
}

/** Find a person by normalized display name or create it. */
export async function getOrCreatePerson(displayName: string): Promise<number> {
  const parsed = parsePersonName(displayName)
  const key = normKey(parsed.displayName)
  const existing = await db.people.get({ nameKey: key })
  if (existing?.id) return existing.id
  const person: Person = {
    lastName: parsed.lastName,
    firstName: parsed.firstName,
    displayName: parsed.displayName,
    nameKey: key,
  }
  return db.people.add(person)
}

/** Add a roster membership if it doesn't already exist. */
export async function addRosterMember(
  teamId: number,
  personId: number,
  defaultRoleId: number,
): Promise<void> {
  const existing = await db.rosterMemberships
    .where('[teamId+personId]')
    .equals([teamId, personId])
    .first()
  if (existing) return
  await db.rosterMemberships.add({ teamId, personId, defaultRoleId })
}

/** Add an assignment if the (event, person, role) triple doesn't exist yet. */
export async function addAssignment(
  eventId: number,
  personId: number,
  roleId: number,
): Promise<void> {
  const existing = await db.assignments
    .where('[eventId+personId+roleId]')
    .equals([eventId, personId, roleId])
    .first()
  if (existing) return
  await db.assignments.add({ eventId, personId, roleId })
}

/** Merge sourceTeam into targetTeam: re-point events/rosters, delete source. */
export async function mergeTeams(sourceId: number, targetId: number): Promise<void> {
  if (sourceId === targetId) return
  await db.transaction('rw', db.events, db.rosterMemberships, db.teams, async () => {
    await db.events.where('teamId').equals(sourceId).modify({ teamId: targetId })
    const members = await db.rosterMemberships.where('teamId').equals(sourceId).toArray()
    for (const m of members) {
      await addRosterMember(targetId, m.personId, m.defaultRoleId)
    }
    await db.rosterMemberships.where('teamId').equals(sourceId).delete()
    await db.teams.delete(sourceId)
  })
}

/** Duplicate a schedule event (and its assignments) as a new manual entry. Returns the new event id. */
export async function duplicateEvent(eventId: number): Promise<number> {
  return db.transaction('rw', db.events, db.assignments, async () => {
    const ev = await db.events.get(eventId)
    if (!ev) throw new Error(`Event ${eventId} not found`)
    const assignments = await db.assignments.where('eventId').equals(eventId).toArray()
    const { id: _id, ...rest } = ev
    const newId = await db.events.add({
      ...rest,
      sourceId: null,
      sourceKey: 'manual-' + new Date().toISOString(),
      originalStart: null,
      originalEnd: null,
      manual: true,
    })
    if (assignments.length > 0) {
      await db.assignments.bulkAdd(
        assignments.map(({ id: _aid, ...a }) => ({ ...a, eventId: newId })),
      )
    }
    return newId
  })
}

export async function mergePeople(sourceId: number, targetId: number): Promise<void> {
  if (sourceId === targetId) return
  await db.transaction('rw', db.assignments, db.rosterMemberships, db.people, async () => {
    await db.assignments.where('personId').equals(sourceId).modify({ personId: targetId })
    const members = await db.rosterMemberships.where('personId').equals(sourceId).toArray()
    for (const m of members) await addRosterMember(m.teamId, targetId, m.defaultRoleId)
    await db.rosterMemberships.where('personId').equals(sourceId).delete()
    await db.people.delete(sourceId)
  })
}
