import type { Timestamp } from 'firebase/firestore'

export type Event = {
  name: string
  slug: string
  primaryLocale: string
  primaryContacts: string[]
  status: 'planning' | 'live' | 'archived'
  dates: { start: Timestamp; end: Timestamp }
  publicSlug?: string
  publishToPublic: boolean
  createdAt: Timestamp
  deletedAt: Timestamp | null
}
