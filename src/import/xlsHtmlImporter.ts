import { parseStartEnd } from '../lib/dateParse'
import { splitPeopleCell, type ParsedName } from '../lib/nameParse'
import { cleanText, normKey } from '../lib/normalize'
import type { ImportResult, ParsedEvent, SourceImporter } from './SourceImporter'

// Maps a normalized header label to our field name.
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

function parsePeopleCount(cell: string): number | null {
  const cleaned = cleanText(cell ?? '')
  if (!cleaned || cleaned === '-') return 0
  const totalMatch = cleaned.match(/[([]\s*total\s*:\s*(\d+)\s*[)\]]/i)
  if (totalMatch) return Number(totalMatch[1])
  if (/^\d+$/.test(cleaned)) return Number(cleaned)
  const parts = cleaned
    .split(/[,\n;]/)
    .map((part) => cleanText(part))
    .filter((part) => part && part !== '-')
  return parts.length
}

export const xlsHtmlImporter: SourceImporter = {
  kind: 'xls-html',
  label: 'Club-Spielplan (.xls / HTML-Tabelle)',

  detect(fileName, text) {
    const lower = text.toLowerCase()
    return (
      /\.xls$/i.test(fileName) ||
      (lower.includes('<table') && lower.includes('trainingsgruppe'))
    )
  },

  parse(text): ImportResult {
    const doc = new DOMParser().parseFromString(text, 'text/html')
    const rows = Array.from(doc.querySelectorAll('tr'))
    if (rows.length === 0) return { events: [], teamNames: [], peopleNames: [] }

    // First row = header.
    const headerCells = Array.from(rows[0].querySelectorAll('th, td'))
    const fieldByCol = headerCells.map((c) => classifyHeader(cleanText(c.textContent ?? '')))
    const isPracticeUpdate =
      fieldByCol.includes('availablePlayers') || fieldByCol.includes('additionalPlayers')

    const events: ParsedEvent[] = []
    const teamNames = new Set<string>()
    const peopleNames = new Set<string>()

    for (const row of rows.slice(1)) {
      const cells = Array.from(row.querySelectorAll('td'))
      if (cells.length === 0) continue
      const get = (field: string): string => {
        const idx = fieldByCol.indexOf(field)
        return idx >= 0 && cells[idx] ? cleanText(cells[idx].textContent ?? '') : ''
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
      const possiblePlayerCount =
        isPracticeUpdate && (availablePlayerCount !== null || additionalPlayerCount !== null)
          ? (availablePlayerCount ?? 0) + (additionalPlayerCount ?? 0)
          : null
      // Identity = date|team|start plus location/remarks to separate distinct
      // events that share the same slot (e.g. two simultaneous tournament games).
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
