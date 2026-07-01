/**
 * Parse the export's "dd.mm.yy" date plus an "HH:mm" time into an ISO string
 * in local time. Two-digit years are interpreted as 2000-2099.
 */
export function parseDateTime(dateStr: string, timeStr: string): string | null {
  const d = dateStr.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/)
  if (!d) return null
  const day = +d[1]
  const month = +d[2]
  let year = +d[3]
  if (year < 100) year += 2000

  let hours = 0
  let mins = 0
  const t = timeStr.trim().match(/^(\d{1,2}):(\d{2})/)
  if (t) {
    hours = +t[1]
    mins = +t[2]
  }
  const dt = new Date(year, month - 1, day, hours, mins, 0, 0)
  if (isNaN(dt.getTime())) return null
  return dt.toISOString()
}

/**
 * Build start/end ISO strings. If the end time is earlier than start (e.g.
 * crosses midnight) the end is rolled to the next day.
 */
export function parseStartEnd(
  dateStr: string,
  startStr: string,
  endStr: string,
): { start: string | null; end: string | null } {
  const start = parseDateTime(dateStr, startStr)
  let end = parseDateTime(dateStr, endStr)
  if (start && end && new Date(end) < new Date(start)) {
    end = new Date(new Date(end).getTime() + 24 * 3600 * 1000).toISOString()
  }
  // If no usable end time, leave null (calendar will render a default block).
  if (!endStr || !endStr.trim() || endStr.trim() === '00:00') end = null
  return { start, end }
}

const FMT_DATE = new Intl.DateTimeFormat('de-CH', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})
const FMT_TIME = new Intl.DateTimeFormat('de-CH', { hour: '2-digit', minute: '2-digit' })

export function fmtDate(iso: string): string {
  return FMT_DATE.format(new Date(iso))
}
export function fmtTime(iso: string): string {
  return FMT_TIME.format(new Date(iso))
}
export function fmtRange(startIso: string, endIso: string | null): string {
  const d = fmtDate(startIso)
  const s = fmtTime(startIso)
  if (!endIso) return `${d} · ${s}`
  return `${d} · ${s}–${fmtTime(endIso)}`
}
