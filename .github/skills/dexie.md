# Dexie skill

## Versions

- Dexie **4** (`dexie`)
- dexie-react-hooks **4** (`dexie-react-hooks`)

## Schema definition

Extend `Dexie` and declare tables as class fields:

```ts
import Dexie, { type Table } from 'dexie'
import type { Team, Person } from './types'

export class MihDB extends Dexie {
  teams!: Table<Team, number>
  people!: Table<Person, number>

  constructor() {
    super('mih-schedule')
    this.version(1).stores({
      // '++id' = auto-increment primary key
      // '&name' = unique index
      // '[a+b]' = compound index
      teams: '++id, &nameKey, name',
      people: '++id, &nameKey, displayName',
    })
  }
}

export const db = new MihDB()
```

## Entity types

All entities are defined in `src/db/types.ts`. The `id` field is always optional (`number | undefined`) because it is absent before insertion:

```ts
export interface Team {
  id?: number
  name: string
  nameKey: string // normalised dedup key (lowercase, single-spaced)
  ageGroup: string
  color: string
}
```

## CRUD patterns

### Read

```ts
// By primary key
const team = await db.teams.get(id)

// By unique index
const team = await db.teams.get({ nameKey: key })

// All rows
const teams = await db.teams.toArray()

// Ordered
const people = await db.people.orderBy('displayName').toArray()

// Compound index lookup
const event = await db.events
  .where('[sourceId+sourceKey]')
  .equals([sourceId, sourceKey])
  .first()
```

### Write

```ts
// Insert — returns the new auto-increment id
const id = await db.teams.add(team)

// Upsert (merge partial patch)
await db.events.update(eventId, { status: 'cancelled' })

// Bulk insert
await db.roles.bulkAdd(DEFAULT_ROLES as Role[])

// Delete
await db.teams.delete(teamId)
```

### Bulk modify

```ts
// Update every row matching a where clause
await db.events.where('teamId').equals(sourceId).modify({ teamId: targetId })

// Delete all matching rows
await db.rosterMemberships.where('teamId').equals(teamId).delete()
```

### Transactions

Wrap multi-step mutations that must be atomic:

```ts
await db.transaction('rw', db.events, db.rosterMemberships, db.teams, async () => {
  await db.events.where('teamId').equals(sourceId).modify({ teamId: targetId })
  await db.rosterMemberships.where('teamId').equals(sourceId).delete()
  await db.teams.delete(sourceId)
})
```

## Reactive queries with `useLiveQuery`

Always provide a default value (third argument) to avoid `undefined` flash on first render:

```tsx
import { useLiveQuery } from 'dexie-react-hooks'

// Returns Team[] (never undefined)
const teams = useLiveQuery(() => db.teams.toArray(), [], [])

// Returns ScheduleEvent | undefined on first render without default
const event = useLiveQuery(() => db.events.get(eventId), [eventId])
```

Use the `deps` array (second argument) to re-run the query when inputs change:

```tsx
const event = useLiveQuery(
  () => db.events.get(eventId),
  [eventId], // re-runs when eventId changes
)
```

## Normalised dedup keys

Use `normKey()` from `src/lib/normalize.ts` to create lowercase, single-spaced keys before every lookup or insert, so that duplicate detection is case- and whitespace-insensitive:

```ts
import { normKey } from '../lib/normalize'

const key = normKey(displayName)
const existing = await db.people.get({ nameKey: key })
```

## get-or-create pattern

```ts
export async function getOrCreateTeam(name: string): Promise<number> {
  const key = normKey(cleanText(name))
  const existing = await db.teams.get({ nameKey: key })
  if (existing?.id) return existing.id
  return db.teams.add({ name: cleanText(name), nameKey: key, … } as Team)
}
```

## Versioning and migrations

Add a new `.version(n).stores({ … })` block to evolve the schema. Dexie applies upgrades automatically on next open:

```ts
this.version(2).stores({
  // new or changed table definitions
  events: '++id, sourceId, teamId, status, start, [sourceId+sourceKey], newIndex',
}).upgrade(tx => { /* data migration */ })
```
