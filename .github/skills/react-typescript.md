# React + TypeScript skill

## Versions

- React **19** (`react`, `react-dom`)
- TypeScript **6** (strict mode)

## Component conventions

### File structure

Each feature page lives in `src/features/<feature>/` and exports a single default page component.
Shared primitives live in `src/components/`.

```tsx
// src/features/teams/TeamsPage.tsx
export default function TeamsPage() { … }
```

### Props typing

Always define props inline in the function signature or with a local interface — never use `React.FC<Props>`:

```tsx
export default function EventDrawer({
  eventId,
  onClose,
}: {
  eventId: number
  onClose: () => void
}) { … }
```

### Children

Use `React.ReactNode` for children props; avoid the deprecated `React.FC` children inference.

## Hooks

### useMemo

Use `useMemo` for maps and filtered/derived lists built from DB data:

```tsx
const teamById = useMemo(
  () => new Map(teams.map((t) => [t.id!, t])),
  [teams],
)
```

### useState with generic set-operations

Pass an updater function to avoid stale-closure bugs when toggling sets:

```tsx
const toggle = <T,>(set: Set<T>, value: T) => {
  const next = new Set(set)
  next.has(value) ? next.delete(value) : next.add(value)
  return next
}
setSelectedPeople((s) => toggle(s, id))
```

### useEffect

Only use `useEffect` for side effects that cannot be expressed as Dexie reactive queries (e.g., DOM event listeners, one-time migrations). Always clean up subscriptions:

```tsx
useEffect(() => {
  const handler = () => { … }
  window.addEventListener('resize', handler)
  return () => window.removeEventListener('resize', handler)
}, [])
```

## TypeScript patterns

### Type imports

Prefer `import type` for symbols that are only used as types:

```tsx
import type { ScheduleEvent } from '../../db/types'
```

### Discriminated unions / literal types

Use string literal union types for bounded enums:

```tsx
type Tab = 'schedule' | 'teams' | 'people' | 'sources' | 'settings'
type EventStatus = 'active' | 'cancelled'
```

### `satisfies` for const arrays

Use `satisfies` to validate a constant without widening it:

```tsx
const FIELDS = ['start', 'end', 'type'] as const satisfies readonly (keyof ScheduleEvent)[]
```

### Avoid `as any`

Cast through a precise intermediate type or use a type guard instead of `as any`.

### Non-null assertion (`!`)

Use sparingly — only when you have verified the value cannot be null/undefined (e.g., after a guard or after `db.add()` which always returns a number):

```tsx
const id = await db.events.add(event) // returns number
setOpenId(id)
```

## JSX style guide

- Use `className` over `style` for reusable styles; use inline `style` only for one-off layout values (`flex: 1`, `marginLeft: 8`, etc.).
- Prefer conditional rendering with `&&` or ternary over separate components for small branches.
- Use fragment shorthand `<>…</>` to avoid unnecessary DOM nodes.
- Always provide a `key` prop when mapping to JSX elements.
