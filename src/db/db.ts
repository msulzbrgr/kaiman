import Dexie, { type Table } from 'dexie'
import {
  type Assignment,
  type Person,
  type Role,
  type RosterMembership,
  type ScheduleEvent,
  type Source,
  type Team,
  DEFAULT_ROLES,
} from './types'

export class MihDB extends Dexie {
  sources!: Table<Source, number>
  teams!: Table<Team, number>
  people!: Table<Person, number>
  rosterMemberships!: Table<RosterMembership, number>
  roles!: Table<Role, number>
  events!: Table<ScheduleEvent, number>
  assignments!: Table<Assignment, number>

  constructor() {
    super('mih-schedule')
    this.version(1).stores({
      sources: '++id, kind, importedAt',
      teams: '++id, &nameKey, name',
      people: '++id, &nameKey, displayName',
      rosterMemberships: '++id, teamId, personId, [teamId+personId]',
      roles: '++id, &key, order',
      events: '++id, sourceId, teamId, status, start, [sourceId+sourceKey]',
      assignments: '++id, eventId, personId, roleId, [eventId+personId+roleId]',
    })
  }
}

export const db = new MihDB()

/** Ensure the default role set exists exactly once. */
export async function ensureSeed(): Promise<void> {
  const count = await db.roles.count()
  if (count === 0) {
    await db.roles.bulkAdd(DEFAULT_ROLES as Role[])
  }
}

/** Resolve common role ids by key (used by the importer). */
export async function roleIdByKey(key: string): Promise<number | undefined> {
  const r = await db.roles.get({ key })
  return r?.id
}
