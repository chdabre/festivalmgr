import type { ChecklistItemConfig } from '../types/checklist'

/**
 * Default starter checklist seeded on every new event. Items are ordered by
 * the `order` field so the UI doesn't need a separate sort step. IDs are
 * stable strings — never reused even if the label is rewritten — so per-artist
 * state survives template edits.
 */
export const defaultArtistChecklistTemplate = (): ChecklistItemConfig[] => [
  { id: 'promo-received',         label: 'Promo material received',     order: 10 },
  { id: 'tech-rider-received',    label: 'Tech rider received',         order: 20, requirement: { type: 'resource' } },
  { id: 'stage-plot-received',    label: 'Stage plot received',         order: 30, requirement: { type: 'resource' } },
  { id: 'contract-sent',          label: 'Contract sent',               order: 40 },
  { id: 'contract-signed',        label: 'Contract signed',             order: 50, requirement: { type: 'resource' } },
  { id: 'production-sheet',       label: 'Production sheet completed',  order: 60 },
  { id: 'hospitality-confirmed',  label: 'Hospitality info confirmed',  order: 70 },
  { id: 'travel-arranged',        label: 'Travel arranged',             order: 80 },
  { id: 'accommodation-arranged', label: 'Accommodation arranged',      order: 90 },
]
