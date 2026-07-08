import { readSheet } from 'read-excel-file/browser'
import { parseStartEnd } from '../lib/dateParse'
import { splitPeopleCell, type ParsedName } from '../lib/nameParse'
import { cleanText, normKey } from '../lib/normalize'
import { combinePlayerCounts, parsePeopleCount } from './playerAvailability'
import type { ImportResult, ParsedEvent, SourceImporter } from './SourceImporter'

function classifyHeader(h: string): string | null {
  const s = h.toLowerCase()
  if (s.startsWith('datum')) return 'date'
  if (s.startsWith('tag')) return 'weekday'
  if (s.startsWith('altersgruppe')) return 'ageGroup'
  if (s.includes('team') || s.includes('trainingsgruppe')) return 'team'
  if (s.startsWith('event')) return 'type'
  if (s.startsWith('gegner')) return 'opponent'
  if (s.startsWith('art')) return 'art'
  if (s.startsWith('treffpunkt')) return 'meetingPoint'
  if (s.startsWith('abfahrt')) return 'departure'
  if (s.startsWith('ort')) return 'location'
  if (s.startsWith('start')) return 'startTime'
  if (s.startsWith('ende')) return 'endTime'
  if (s.startsWith('bemerkung')) return 'remarks'
  if (s.startsWith('verfügbar') || s.startsWith('verfugbar')) return 'availablePlayers'
  if (s.startsWith('zusätzliche spieler') || s.startsWith('zusatzliche spieler'))
    return 'additionalPlayers'
  if (s.includes('coach') || s.includes('staff')) return 'staff'
  if (s.startsWith('helfer')) return 'helpers'
  return null
}

/** Detect binary Excel files by magic bytes or .xlsx extension. */
function isBinaryExcel(fileName: string, text: string): boolean {
  if (/\.xlsx$/i.test(fileName)) return true
  // Binary .xls (BIFF) starts with the OLE2 magic bytes D0 CF 11 E0.
  // When decoded as UTF-8, these appear as the replacement char or garbled text.
  // We check the filename matches .xls AND the content is not valid HTML/XML.
  if (/\.xls$/i.test(fileName)) {
    const trimmed = text.trimStart()
    // OLE2 magic: first bytes are 0xD0 0xCF 0x11 0xE0
    if (trimmed.charCodeAt(0) === 0xD0 || trimmed.charCodeAt(0) === 0xFFFD) return true
    // Not HTML-like content = likely binary
    if (!trimmed.startsWith('<')) return true
  }
  return false
}

export const xlsBinaryImporter: SourceImporter = {
  kind: 'xls-binary',
  label: 'Excel-Datei (.xls / .xlsx)',

  detect(fileName, text) {
    return isBinaryExcel(fileName, text)
  },

  async parse(_text: string, buffer?: ArrayBuffer): Promise<ImportResult> {
    if (!buffer) return { events: [], teamNames: [], peopleNames: [] }

    const rows = await readSheet(buffer)
    if (rows.length === 0) return { events: [], teamNames: [], peopleNames: [] }

    // First row = header.
    const headerRow = rows[0].map((cell) => cleanText(String(cell ?? '')))
    const fieldByCol = headerRow.map((h) => classifyHeader(h))
    const isPracticeUpdate =
      fieldByCol.includes('availablePlayers') || fieldByCol.includes('additionalPlayers')

    const events: ParsedEvent[] = []
    const teamNames = new Set<string>()
    const peopleNames = new Set<string>()

    for (const row of rows.slice(1)) {
      const get = (field: string): string => {
        const idx = fieldByCol.indexOf(field)
        return idx >= 0 && row[idx] != null ? cleanText(String(row[idx])) : ''
      }

      const date = get('date')
      const teamName = get('team')
      const ageGroup = get('ageGroup')
      if (!date || (!teamName && !ageGroup)) continue

      const typeRaw = get('type').toLowerCase()
      const type = typeRaw.includes('spiel') ? 'game' : 'training'
      const home = !typeRaw.includes('auswärts') && !typeRaw.includes('auswarts')

      const startTime = get('startTime')
      const { start, end } = parseStartEnd(date, startTime, get('endTime'))

      const staff = splitPeopleCell(get('staff'))
      const helpers = splitPeopleCell(get('helpers'))
      staff.forEach((p: ParsedName) => peopleNames.add(p.displayName))
      helpers.forEach((p: ParsedName) => peopleNames.add(p.displayName))
      if (teamName) teamNames.add(teamName)

      const location = get('location')
      const remarks = get('remarks')
      const availablePlayerCount = isPracticeUpdate ? parsePeopleCount(get('availablePlayers')) : null
      const additionalPlayerCount = isPracticeUpdate ? parsePeopleCount(get('additionalPlayers')) : null
      const possiblePlayerCount = isPracticeUpdate
        ? combinePlayerCounts(availablePlayerCount, additionalPlayerCount)
        : null
      const sourceKey = isPracticeUpdate
        ? [date, normKey(teamName || ageGroup), startTime].join('|')
        : [date, normKey(teamName), startTime, normKey(location), normKey(remarks)].join('|')

      events.push({
        teamName,
        ageGroup,
        type,
        art: get('art'),
        opponent: get('opponent'),
        home,
        location,
        meetingPoint: get('meetingPoint'),
        departure: get('departure'),
        start,
        end,
        remarks,
        availablePlayerCount: availablePlayerCount ?? undefined,
        possiblePlayerCount: possiblePlayerCount ?? undefined,
        staff,
        helpers,
        sourceKey,
      })
    }

    return {
      mode: isPracticeUpdate ? 'practice-update' : 'source-merge',
      events,
      teamNames: [...teamNames],
      peopleNames: [...peopleNames],
    }
  },
}
