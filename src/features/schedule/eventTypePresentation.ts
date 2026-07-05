import type { EventType } from '../../db/types'

type EventTypeLike =
  | { type: Extract<EventType, 'training'>; art?: string }
  | { type: Extract<EventType, 'game'>; home: boolean }

export const EVENT_TYPE_LEGEND_ITEMS = [
  { key: 'training-dry', icon: '🏋️', label: 'Trockentraining' },
  { key: 'training-ice', icon: '⛸️', label: 'Eistraining' },
  { key: 'game-home', icon: '🏠', label: 'Heimspiel' },
  { key: 'game-away', icon: '🚌', label: 'Auswärtsspiel' },
] as const

export function getEventTypeIcon(event: EventTypeLike): string {
  if (event.type === 'training') return event.art === 'Eistraining' ? '⛸️' : '🏋️'
  return event.home ? '🏠' : '🚌'
}

export function getEventTypeLabel(event: EventTypeLike): string {
  if (event.type === 'training') return event.art === 'Eistraining' ? 'Eistraining' : 'Trockentraining'
  return event.home ? 'Heimspiel' : 'Auswärtsspiel'
}
