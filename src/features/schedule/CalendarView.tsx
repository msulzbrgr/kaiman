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

export default function CalendarView({
  events,
  onSelect,
}: {
  events: FcEvent[]
  onSelect: (id: number) => void
}) {
  return (
    <div className="calendar-wrap">
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, listPlugin, multiMonthPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        firstDay={1}
        locale="de"
        height="100%"
        nowIndicator
        headerToolbar={{
          left: 'prev,next today',
          center: 'title',
          right: 'timeGridDay,workWeek,timeGridWeek,twoWeek,dayGridMonth,listMonth',
        }}
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
