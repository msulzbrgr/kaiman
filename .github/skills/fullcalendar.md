# FullCalendar skill

## Version

FullCalendar **6** — `@fullcalendar/{core,react,daygrid,timegrid,list,multimonth,interaction}`

## Installed plugins

| Plugin | Purpose |
|---|---|
| `@fullcalendar/daygrid` | Month/day-grid views |
| `@fullcalendar/timegrid` | Day and week time-grid views |
| `@fullcalendar/list` | Agenda/list views |
| `@fullcalendar/multimonth` | Multi-month view |
| `@fullcalendar/interaction` | Drag-and-drop, resizing, external drops |
| `@fullcalendar/react` | React wrapper component |

## Event shape

Map DB events to a plain object that FullCalendar accepts. Keep a local `FcEvent` interface so TypeScript enforces the shape before passing to FullCalendar:

```ts
export interface FcEvent {
  id: string        // must be a string, even if the DB id is a number
  title: string
  start: string     // ISO string
  end?: string      // ISO string
  color: string     // hex
  cancelled: boolean
}
```

Convert to the FullCalendar event object when passing to `<FullCalendar events={…}>`:

```tsx
events={fcEvents.map((e) => ({
  id: e.id,
  title: e.title,
  start: e.start,
  end: e.end,
  backgroundColor: e.cancelled ? '#c2c6cd' : e.color,
  borderColor: e.cancelled ? '#c2c6cd' : e.color,
  classNames: e.cancelled ? ['cancelled'] : [],
}))}
```

## Component setup

Always pass the full `plugins` array — FullCalendar does not auto-register plugins:

```tsx
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import listPlugin from '@fullcalendar/list'
import multiMonthPlugin from '@fullcalendar/multimonth'
import interactionPlugin from '@fullcalendar/interaction'

<FullCalendar
  plugins={[dayGridPlugin, timeGridPlugin, listPlugin, multiMonthPlugin, interactionPlugin]}
  initialView="dayGridMonth"
  firstDay={1}      // week starts on Monday
  locale="de"
  height="100%"
  nowIndicator
  …
/>
```

## Custom views

Register named view aliases in the `views` prop:

```tsx
views={{
  workWeek: { type: 'timeGridWeek', weekends: false, buttonText: 'Arbeitswoche' },
  twoWeek:  { type: 'dayGrid', duration: { weeks: 2 }, buttonText: '2 Wochen' },
  listMonth: { buttonText: 'Agenda' },
}}
```

Reference them in `headerToolbar`:

```tsx
headerToolbar={{
  left: 'prev,next today',
  center: 'title',
  right: 'timeGridDay,workWeek,timeGridWeek,twoWeek,dayGridMonth,listMonth',
}}
```

## Responsive toolbar

Detect the viewport size once and update on resize (debounced). Switch the `headerToolbar` and `initialView` based on the breakpoint rather than using media queries, because FullCalendar does not expose CSS-breakpoint hooks:

```tsx
type Breakpoint = 'mobile' | 'tablet' | 'desktop'

function getBreakpoint(w: number): Breakpoint {
  if (w < 640) return 'mobile'
  if (w < 1024) return 'tablet'
  return 'desktop'
}

const [bp, setBp] = useState<Breakpoint>(() => getBreakpoint(window.innerWidth))

useEffect(() => {
  let timer: ReturnType<typeof setTimeout>
  const handler = () => {
    clearTimeout(timer)
    timer = setTimeout(() => setBp(getBreakpoint(window.innerWidth)), 150)
  }
  window.addEventListener('resize', handler)
  return () => { clearTimeout(timer); window.removeEventListener('resize', handler) }
}, [])
```

## Slot range (dynamic min/max time)

Compute `slotMinTime` / `slotMaxTime` from visible events so the time-grid doesn't show empty hours:

```tsx
const slotRange = useMemo(() => {
  // collect min start and max end of visible events
  // add a SLOT_BUFFER_MINUTES buffer on each side
  // fall back to '06:00:00' / '23:00:00' when no events
  …
}, [fcEvents, visibleRange])

<FullCalendar slotMinTime={slotRange.min} slotMaxTime={slotRange.max} … />
```

Track the currently visible date range via `datesSet`:

```tsx
datesSet={(arg) => onVisibleRangeChange({ start: arg.start, end: arg.end })}
```

## Drag-and-drop

Enable with `editable` and `droppable` props. Extract IDs from string event ids:

```tsx
editable={true}
droppable={true}

eventDrop={(arg) =>
  onEventDrop(Number(arg.event.id), arg.event.start!, arg.event.end)
}
eventResize={(arg) =>
  onEventResize(Number(arg.event.id), arg.event.start!, arg.event.end)
}
// external drops (dragging list-items onto the calendar):
drop={(arg) => onExternalDrop(arg.draggedEl, arg.date)}
```

## Event click

Always call `info.jsEvent.preventDefault()` to prevent FullCalendar's default URL navigation:

```tsx
eventClick={(info) => {
  info.jsEvent.preventDefault()
  onSelect(Number(info.event.id))
}}
```
