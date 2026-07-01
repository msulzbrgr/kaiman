import { useEffect, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import listPlugin from '@fullcalendar/list'
import multiMonthPlugin from '@fullcalendar/multimonth'
import interactionPlugin from '@fullcalendar/interaction'

export interface FcEvent {
  id: string
  title: string
  start: string
  end?: string
  color: string
  cancelled: boolean
}

type Breakpoint = 'mobile' | 'tablet' | 'desktop'

function getBreakpoint(w: number): Breakpoint {
  if (w < 640) return 'mobile'
  if (w < 1024) return 'tablet'
  return 'desktop'
}

export default function CalendarView({
  events,
  onSelect,
}: {
  events: FcEvent[]
  onSelect: (id: number) => void
}) {
  const [bp, setBp] = useState<Breakpoint>(() => getBreakpoint(window.innerWidth))

  useEffect(() => {
    const handler = () => setBp(getBreakpoint(window.innerWidth))
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
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
        slotMinTime="06:00:00"
        slotMaxTime="23:00:00"
        events={events.map((e) => ({
          id: e.id,
          title: e.title,
          start: e.start,
          end: e.end,
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
