import type { EventType } from '../../db/types'

type EventTypeLike =
  | { type: Extract<EventType, 'training'> }
  | { type: Extract<EventType, 'game'>; home: boolean }

export const EVENT_TYPE_LEGEND_ITEMS = [
  { key: 'training', icon: '🏋️', label: 'Training' },
  { key: 'game-home', icon: '🏠', label: 'Heimspiel' },
  { key: 'game-away', icon: '🚌', label: 'Auswärtsspiel' },
] as const

export function getEventTypeIcon(event: EventTypeLike): string {
  if (event.type === 'training') return '🏋️'
  return event.home ? '🏠' : '🚌'
}

export function getEventTypeLabel(event: EventTypeLike): string {
  if (event.type === 'training') return 'Training'
  return event.home ? 'Heimspiel' : 'Auswärtsspiel'
}
