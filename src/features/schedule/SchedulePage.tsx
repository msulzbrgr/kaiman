import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import FilterRail from './FilterRail'
import CalendarView, { type FcEvent } from './CalendarView'
import EventDrawer from './EventDrawer'

// Drop the club prefix from the team name for compact agenda titles:
// "EHC Zuchwil Regio U9"/"…U12" -> "U9"/"U12"; anything else -> "U14".
function shortTeamLabel(name: string): string {
  const stripped = name.replace(/EHC Zuchwil Regio/gi, '').trim()
  return /U9|U12/i.test(stripped) ? stripped : 'U14'
}

export default function SchedulePage() {
  const teams = useLiveQuery(() => db.teams.toArray(), [], [])
  const people = useLiveQuery(() => db.people.orderBy('displayName').toArray(), [], [])
  const events = useLiveQuery(() => db.events.toArray(), [], [])
  const assignments = useLiveQuery(() => db.assignments.toArray(), [], [])

  const [selectedTeams, setSelectedTeams] = useState<Set<number>>(new Set())
  const [selectedPeople, setSelectedPeople] = useState<Set<number>>(new Set())
  const [showTraining, setShowTraining] = useState(true)
  const [showGame, setShowGame] = useState(true)
  const [combineAnd, setCombineAnd] = useState(false)
  const [openId, setOpenId] = useState<number | null>(null)

  const teamById = useMemo(() => new Map(teams.map((t) => [t.id!, t])), [teams])

  // eventId -> set of personIds assigned
  const peopleByEvent = useMemo(() => {
    const m = new Map<number, Set<number>>()
    for (const a of assignments) {
      if (!m.has(a.eventId)) m.set(a.eventId, new Set())
      m.get(a.eventId)!.add(a.personId)
    }
    return m
  }, [assignments])

  const fcEvents: FcEvent[] = useMemo(() => {
    return events
      .filter((e) => e.start)
      .filter((e) => (e.type === 'training' ? showTraining : showGame))
      .filter((e) => {
        const teamActive = selectedTeams.size > 0
        const personActive = selectedPeople.size > 0
        if (!teamActive && !personActive) return true
        const teamHit = teamActive && selectedTeams.has(e.teamId)
        const personHit =
          personActive &&
          [...(peopleByEvent.get(e.id!) ?? [])].some((pid) => selectedPeople.has(pid))
        if (teamActive && personActive) return combineAnd ? teamHit && personHit : teamHit || personHit
        return teamActive ? teamHit : personHit
      })
      .map((e) => {
        const team = teamById.get(e.teamId)
        const typeLabel = e.type === 'game' ? (e.home ? 'Spiel' : 'Spiel (A)') : 'Training'
        const detail =
          e.type === 'training'
            ? e.art ? ` · ${e.art}` : ''
            : e.opponent ? ` vs ${e.opponent}` : ''
        const teamLabel = team ? shortTeamLabel(team.name) : '?'
        const remarks = e.remarks?.trim() ?? ''
        const desc = remarks && remarks.length < 50 ? ` · ${remarks.slice(0, 5)}` : ''
        const prefix = e.type === 'training' ? '' : `${typeLabel} · `
        const title = `${prefix}${teamLabel}${detail}${desc}`
        return {
          id: String(e.id),
          title: e.status === 'cancelled' ? `[Entfällt] ${title}` : title,
          start: e.start!,
          end: e.end ?? undefined,
          color: team?.color ?? '#2563eb',
          cancelled: e.status === 'cancelled',
        }
      })
  }, [events, peopleByEvent, teamById, selectedTeams, selectedPeople, showTraining, showGame, combineAnd])

  const toggle = (set: Set<number>, id: number) => {
    const next = new Set(set)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  }

  async function createEvent() {
    const teamId = [...selectedTeams][0] ?? teams[0]?.id
    if (!teamId) {
      alert('Bitte zuerst ein Team anlegen oder importieren.')
      return
    }
    const start = new Date()
    start.setHours(18, 0, 0, 0)
    const end = new Date(start.getTime() + 90 * 60 * 1000)
    const id = await db.events.add({
      sourceId: null,
      sourceKey: 'manual-' + start.toISOString(),
      teamId,
      type: 'training',
      art: '',
      opponent: '',
      home: true,
      location: '',
      meetingPoint: '',
      departure: '',
      start: start.toISOString(),
      end: end.toISOString(),
      remarks: '',
      status: 'active',
      manual: true,
    })
    setOpenId(id)
  }

  return (
    <div className="schedule">
      <FilterRail
        teams={teams}
        people={people}
        selectedTeams={selectedTeams}
        selectedPeople={selectedPeople}
        showTraining={showTraining}
        showGame={showGame}
        combineAnd={combineAnd}
        onToggleTeam={(id) => setSelectedTeams((s) => toggle(s, id))}
        onTogglePerson={(id) => setSelectedPeople((s) => toggle(s, id))}
        onSetType={(k, v) => (k === 'training' ? setShowTraining(v) : setShowGame(v))}
        onSetCombine={setCombineAnd}
        onClear={() => {
          setSelectedTeams(new Set())
          setSelectedPeople(new Set())
        }}
        onCreateEvent={createEvent}
      />
      <CalendarView events={fcEvents} onSelect={setOpenId} />
      {openId != null && <EventDrawer eventId={openId} onClose={() => setOpenId(null)} />}
    </div>
  )
}
