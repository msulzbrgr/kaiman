export type EventType = 'training' | 'game'
export type EventStatus = 'active' | 'cancelled'

export interface Source {
  id?: number
  kind: string // e.g. 'xls-html'
  label: string
  fileName: string
  importedAt: string // ISO
}

export interface Team {
  id?: number
  name: string
  nameKey: string // normalized dedup key
  ageGroup: string
  color: string
}

export interface Person {
  id?: number
  lastName: string
  firstName: string
  displayName: string
  nameKey: string // normalized dedup key
  notes?: string
}

export interface RosterMembership {
  id?: number
  teamId: number
  personId: number
  defaultRoleId: number
}

export interface Role {
  id?: number
  key: string
  label: string
  order: number
  isBuiltin: boolean
}

export interface ScheduleEvent {
  id?: number
  sourceId: number | null
  sourceKey: string // date|teamNameKey|startTime — stable merge key
  teamId: number
  type: EventType
  art: string // Eistraining / Trockentraining / Freundschaft / ...
  opponent: string
  home: boolean
  location: string
  meetingPoint: string
  departure: string
  start: string | null // ISO
  end: string | null // ISO
  remarks: string
  status: EventStatus
  manual: boolean
}

export interface Assignment {
  id?: number
  eventId: number
  personId: number
  roleId: number
}

export const DEFAULT_ROLES: Omit<Role, 'id'>[] = [
  { key: 'coach', label: 'Coach', order: 1, isBuiltin: true },
  { key: 'assistant_coach', label: 'Assistant Coach', order: 2, isBuiltin: true },
  { key: 'off_ice_coach', label: 'Off-Ice Coach', order: 3, isBuiltin: true },
  { key: 'player', label: 'Spieler', order: 4, isBuiltin: true },
  { key: 'helper', label: 'Helfer', order: 5, isBuiltin: true },
]

/** Role keys the importer uses as defaults. */
export const IMPORT_STAFF_ROLE = 'coach'
export const IMPORT_HELPER_ROLE = 'helper'
