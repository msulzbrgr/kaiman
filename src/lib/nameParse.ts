import { cleanText } from './normalize'

export interface ParsedName {
  lastName: string
  firstName: string
  displayName: string
}

/**
 * Parse a single person cell of the form "Last First" (Swiss club export
 * convention, e.g. "Sulzberger Masato"). Multi-word last names are not
 * distinguishable from the export, so we treat the final token as the first
 * name and everything before it as the last name.
 */
export function parsePersonName(raw: string): ParsedName {
  const name = cleanText(raw)
  const parts = name.split(' ')
  if (parts.length === 1) {
    return { lastName: parts[0], firstName: '', displayName: parts[0] }
  }
  const firstName = parts[parts.length - 1]
  const lastName = parts.slice(0, -1).join(' ')
  return { lastName, firstName, displayName: `${lastName} ${firstName}` }
}

/**
 * Split a "Coaches/Staff" or "Helfer" cell into individual names.
 * Strips the trailing "(Total: N)" / "[Total: N]" counter and ignores the
 * "no entries" placeholders ("-", empty).
 */
export function splitPeopleCell(cell: string): ParsedName[] {
  let s = cell ?? ''
  // remove (Total: N) or [Total: N]
  s = s.replace(/[([]\s*total\s*:\s*\d+\s*[)\]]/i, '')
  s = s.trim()
  if (s === '' || s === '-') return []
  return s
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && p !== '-')
    .map(parsePersonName)
}
