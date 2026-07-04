import { useState } from 'react'
import type { Person, Team } from '../../db/types'

export interface TeamFilterOption {
  key: string
  label: string
  color: string
}

interface Props {
  teams: Team[]
  teamFilters: TeamFilterOption[]
  people: Person[]
  selectedTeamFilters: Set<string>
  selectedPeople: Set<number>
  showTraining: boolean
  showGame: boolean
  combineAnd: boolean
  mobileOpen: boolean
  onToggleTeamFilter: (key: string) => void
  onTogglePerson: (id: number) => void
  onSetType: (kind: 'training' | 'game', v: boolean) => void
  onSetCombine: (v: boolean) => void
  onClear: () => void
  onCreateEvent: () => void
  onMobileClose: () => void
}

export default function FilterRail(p: Props) {
  const [q, setQ] = useState('')
  const filteredPeople = p.people.filter((pe) =>
    pe.displayName.toLowerCase().includes(q.toLowerCase()),
  )
  const anyFilter = p.selectedTeamFilters.size > 0 || p.selectedPeople.size > 0

  return (
    <div className={`filter-rail${p.mobileOpen ? ' mobile-open' : ''}`}>
      <div className="filter-rail-header">
        <div className="filter-drag-handle" />
        <div className="filter-close-row">
          <button className="btn sm" onClick={p.onMobileClose}>✕ Schließen</button>
        </div>
      </div>
      <button className="btn primary" style={{ width: '100%', marginBottom: 14 }} onClick={p.onCreateEvent}>
        + Neues Event
      </button>
      <div className="row">
        <h3 style={{ flex: 1 }}>Filter</h3>
        {anyFilter && (
          <button className="btn sm" onClick={p.onClear}>Zurücksetzen</button>
        )}
      </div>

      <h3>Event-Typ</h3>
      <label className="check-row">
        <input type="checkbox" checked={p.showTraining} onChange={(e) => p.onSetType('training', e.target.checked)} />
        Training
      </label>
      <label className="check-row">
        <input type="checkbox" checked={p.showGame} onChange={(e) => p.onSetType('game', e.target.checked)} />
        Spiel
      </label>

      <h3>Teams</h3>
      {p.teams.length === 0 && <p className="muted">Keine Teams</p>}
      {p.teamFilters.map((teamFilter) => (
        <label className="check-row" key={teamFilter.key}>
          <input
            type="checkbox"
            checked={p.selectedTeamFilters.has(teamFilter.key)}
            onChange={() => p.onToggleTeamFilter(teamFilter.key)}
          />
          <span className="swatch" style={{ background: teamFilter.color }} />
          {teamFilter.label}
        </label>
      ))}

      <h3>Personen</h3>
      <input
        className="searchbox"
        placeholder="Suchen…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {filteredPeople.map((pe) => (
        <label className="check-row" key={pe.id}>
          <input
            type="checkbox"
            checked={p.selectedPeople.has(pe.id!)}
            onChange={() => p.onTogglePerson(pe.id!)}
          />
          {pe.displayName}
        </label>
      ))}

      {p.selectedTeamFilters.size > 0 && p.selectedPeople.size > 0 && (
        <>
          <h3>Verknüpfung</h3>
          <label className="check-row">
            <input
              type="checkbox"
              checked={p.combineAnd}
              onChange={(e) => p.onSetCombine(e.target.checked)}
            />
            Team UND Person (sonst ODER)
          </label>
        </>
      )}
    </div>
  )
}
