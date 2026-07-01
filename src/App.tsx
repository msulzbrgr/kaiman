import { useState } from 'react'
import SchedulePage from './features/schedule/SchedulePage'
import TeamsPage from './features/teams/TeamsPage'
import PeoplePage from './features/people/PeoplePage'
import SourcesPage from './features/sources/SourcesPage'
import SettingsPage from './features/settings/SettingsPage'

type Tab = 'schedule' | 'teams' | 'people' | 'sources' | 'settings'

const TABS: { id: Tab; label: string }[] = [
  { id: 'schedule', label: 'Spielplan' },
  { id: 'teams', label: 'Teams' },
  { id: 'people', label: 'Personen' },
  { id: 'sources', label: 'Quellen' },
  { id: 'settings', label: 'Einstellungen' },
]

export default function App() {
  const [tab, setTab] = useState<Tab>('schedule')
  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">MIH+ Spielplanung Masi</div>
        <div className="tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? 'active' : ''}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="content">
        {tab === 'schedule' && <SchedulePage />}
        {tab === 'teams' && <TeamsPage />}
        {tab === 'people' && <PeoplePage />}
        {tab === 'sources' && <SourcesPage />}
        {tab === 'settings' && <SettingsPage />}
      </div>
    </div>
  )
}
