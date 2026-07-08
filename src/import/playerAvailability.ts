import { cleanText } from '../lib/normalize'

export function parsePeopleCount(cell: string): number | null {
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

export function combinePlayerCounts(
  availablePlayerCount: number | null,
  additionalPlayerCount: number | null,
): number | null {
  if (availablePlayerCount === null && additionalPlayerCount === null) return null
  return (availablePlayerCount ?? 0) + (additionalPlayerCount ?? 0)
}
