import type { EventType } from '../../db/types'

export const ART_EISTRAINING = 'Eistraining'
export const ART_TROCKENTRAINING = 'Trockentraining'

type EventTypeLike =
  | { type: Extract<EventType, 'training'>; art?: string }
  | { type: Extract<EventType, 'game'>; home: boolean }

export const EVENT_TYPE_LEGEND_ITEMS = [
  { key: 'training-dry', icon: '🏋️', label: ART_TROCKENTRAINING },
  { key: 'training-ice', icon: '🏒', label: ART_EISTRAINING },
  { key: 'game-home', icon: '🏠', label: 'Heimspiel' },
  { key: 'game-away', icon: '🚌', label: 'Auswärtsspiel' },
] as const

export function getEventTypeIcon(event: EventTypeLike): string {
  if (event.type === 'training') return event.art === ART_EISTRAINING ? '🏒' : '🏋️'
  return event.home ? '🏠' : '🚌'
}

export function getEventTypeLabel(event: EventTypeLike): string {
  if (event.type === 'training') return event.art === ART_EISTRAINING ? ART_EISTRAINING : ART_TROCKENTRAINING
  return event.home ? 'Heimspiel' : 'Auswärtsspiel'
}
