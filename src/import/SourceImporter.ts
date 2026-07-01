import type { ParsedName } from '../lib/nameParse'
import type { EventType } from '../db/types'

/** A schedule row as produced by any importer, before it touches the DB. */
export interface ParsedEvent {
  teamName: string
  type: EventType
  art: string
  opponent: string
  home: boolean
  location: string
  meetingPoint: string
  departure: string
  start: string | null
  end: string | null
  remarks: string
  /** People parsed from the source, with the role key they default to. */
  staff: ParsedName[]
  helpers: ParsedName[]
  /** Stable identity within a source: date|teamKey|startTime. */
  sourceKey: string
}

export interface ImportResult {
  events: ParsedEvent[]
  /** Distinct team names seen. */
  teamNames: string[]
  /** Distinct person display names seen (staff + helpers). */
  peopleNames: string[]
}

/** Pluggable source. Implement detect()/parse() to add a new format. */
export interface SourceImporter {
  kind: string
  label: string
  /** Quick check whether this importer can handle the file. */
  detect(fileName: string, text: string): boolean
  parse(text: string, buffer?: ArrayBuffer): ImportResult | Promise<ImportResult>
}
