/** Collapse whitespace and lower-case for use as a dedup key. */
export function normKey(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase()
}

/** Trim and collapse internal whitespace, preserving case. */
export function cleanText(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

/** Derive an age-group hint (e.g. "U12") from a team name, or '' if none. */
export function ageGroupHint(teamName: string): string {
  const m = teamName.match(/U\s?\d{1,2}/i)
  return m ? m[0].replace(/\s/g, '').toUpperCase() : ''
}

const TEAM_COLORS = [
  '#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed',
  '#0891b2', '#db2777', '#65a30d', '#ea580c', '#4f46e5',
]

/** Deterministic color for a team based on its index among existing teams. */
export function teamColor(index: number): string {
  return TEAM_COLORS[index % TEAM_COLORS.length]
}
