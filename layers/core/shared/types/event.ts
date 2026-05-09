import type { Timestamp } from 'firebase/firestore'
import type { ChecklistItemConfig } from './checklist'

export type Event = {
  name: string
  slug: string
  primaryLocale: string
  primaryContacts: string[]
  status: 'planning' | 'live' | 'archived'
  dates: { start: Timestamp; end: Timestamp }
  publicSlug?: string
  publishToPublic: boolean
  /**
   * Per-event advancing checklist template. Optional in v1 — `seed-emulator`
   * seeds it via `defaultArtistChecklistTemplate()`. Existing events without
   * the field are valid; the artist UI treats them as having an empty list.
   */
  artistChecklistTemplate?: ChecklistItemConfig[]
  createdAt: Timestamp
  deletedAt: Timestamp | null
}
