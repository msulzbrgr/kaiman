import { useEffect, useState } from 'react'
import type { EventContentArg } from '@fullcalendar/core'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import listPlugin from '@fullcalendar/list'
import multiMonthPlugin from '@fullcalendar/multimonth'
import interactionPlugin from '@fullcalendar/interaction'
import { getNonEmptyText } from '../../lib/text'

export interface FcEvent {
  id: string
  title: string
  start: string
  end?: string
  remarks?: string
  color: string
  cancelled: boolean
}

type Breakpoint = 'mobile' | 'tablet' | 'desktop'
const MAX_VISIBLE_REMARK_LENGTH = 20

function getBreakpoint(w: number): Breakpoint {
  if (w < 640) return 'mobile'
  if (w < 1024) return 'tablet'
  return 'desktop'
}

function formatTimePart(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function formatEventTimeRange(start: Date | null, end: Date | null): string {
  if (!start) return ''
  if (!end) return formatTimePart(start)
  return `${formatTimePart(start)} - ${formatTimePart(end)}`
}

function renderEventContent(arg: EventContentArg) {
  const remarksText = getNonEmptyText(
    typeof arg.event.extendedProps.remarks === 'string' ? arg.event.extendedProps.remarks : null,
  )
  const remarks =
    remarksText !== null && remarksText.length <= MAX_VISIBLE_REMARK_LENGTH ? remarksText : null
  const timeText = formatEventTimeRange(arg.event.start, arg.event.end)
  return (
    <div className="schedule-calendar-event">
      <div className="schedule-calendar-event-mainline">
        {timeText && <span className="schedule-calendar-event-time">{timeText}</span>}
        <span className="schedule-calendar-event-title">{arg.event.title}</span>
      </div>
      {remarks && <div className="schedule-calendar-event-remarks">{remarks}</div>}
    </div>
  )
}

export default function CalendarView({
  events,
  onSelect,
  slotMinTime,
  slotMaxTime,
  onVisibleRangeChange,
  editable,
  droppable,
  onEventDrop,
  onEventResize,
  onExternalDrop,
}: {
  events: FcEvent[]
  onSelect: (id: number) => void
  slotMinTime: string
  slotMaxTime: string
  onVisibleRangeChange: (range: { start: Date; end: Date }) => void
  editable?: boolean
  droppable?: boolean
  onEventDrop?: (eventId: number, start: Date, end: Date | null) => void
  onEventResize?: (eventId: number, start: Date, end: Date | null) => void
  onExternalDrop?: (draggedEl: HTMLElement, date: Date) => void
}) {
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

  const isMobile = bp === 'mobile'
  const isTablet = bp === 'tablet'

  const headerToolbar = isMobile
    ? { left: 'prev,next', center: 'title', right: 'listWeek,listMonth' }
    : isTablet
    ? { left: 'prev,next today', center: 'title', right: 'timeGridDay,timeGridWeek,dayGridMonth,listMonth' }
    : { left: 'prev,next today', center: 'title', right: 'timeGridDay,workWeek,timeGridWeek,twoWeek,dayGridMonth,listMonth' }

  return (
    <div className="calendar-wrap">
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, listPlugin, multiMonthPlugin, interactionPlugin]}
        initialView={isMobile ? 'listWeek' : 'dayGridMonth'}
        firstDay={1}
        locale="de"
        height="100%"
        nowIndicator
        eventDisplay="block"
        headerToolbar={headerToolbar}
        buttonText={{
          today: 'Heute',
          month: 'Monat',
          week: 'Woche',
          day: 'Tag',
          list: 'Agenda',
        }}
        views={{
          workWeek: {
            type: 'timeGridWeek',
            weekends: false,
            buttonText: 'Arbeitswoche',
          },
          twoWeek: {
            type: 'dayGrid',
            duration: { weeks: 2 },
            buttonText: '2 Wochen',
          },
          listMonth: { buttonText: 'Agenda' },
        }}
        slotMinTime={slotMinTime}
        slotMaxTime={slotMaxTime}
        editable={editable ?? false}
        droppable={droppable ?? false}
        eventDrop={
          onEventDrop
            ? (arg) => onEventDrop(Number(arg.event.id), arg.event.start!, arg.event.end)
            : undefined
        }
        eventResize={
          onEventResize
            ? (arg) => onEventResize(Number(arg.event.id), arg.event.start!, arg.event.end)
            : undefined
        }
        drop={
          onExternalDrop ? (arg) => onExternalDrop(arg.draggedEl, arg.date) : undefined
        }
        datesSet={(arg) => {
          onVisibleRangeChange({ start: arg.start, end: arg.end })
        }}
        eventContent={renderEventContent}
        events={events.map((e) => ({
          id: e.id,
          title: e.title,
          start: e.start,
          end: e.end,
          remarks: e.remarks,
          backgroundColor: e.cancelled ? '#c2c6cd' : e.color,
          borderColor: e.cancelled ? '#c2c6cd' : e.color,
          classNames: e.cancelled ? ['cancelled'] : [],
        }))}
        eventClick={(info) => {
          info.jsEvent.preventDefault()
          onSelect(Number(info.event.id))
        }}
      />
    </div>
  )
}
