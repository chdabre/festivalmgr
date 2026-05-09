import type { Timestamp } from 'firebase/firestore'
import type { ChecklistEntry } from './checklist'

export type ArtistStatus =
  | 'planned'    // geplant — in the system, inquiry not yet sent
  | 'inquired'   // angefragt — initial offer email sent, awaiting reply
  | 'confirmed'  // bestätigt — deal locked
  | 'declined'   // they said no (terminal)
  | 'cancelled'  // confirmed but later cancelled (terminal)

export type Artist = {
  // ── Identity ───────────────────────────────────────────────────────
  name: string
  category: string
  links: {
    website?: string
    instagram?: string
    other?: { label: string; url: string }[]
  }
  origin?: string
  shortDescription?: string

  // ── Booking ────────────────────────────────────────────────────────
  status: ArtistStatus
  statusChangedAt: Timestamp
  primaryContact?: { name?: string; email?: string; role?: string; note?: string }
  responsibleUserId?: string

  // ── Deal terms ─────────────────────────────────────────────────────
  fee?: { amount: number; currency: string }
  travelBudget?: { amount: number; currency: string }
  accommodation?: string
  daysPresent?: number
  dealNotes?: string

  // ── Performance metadata (intent — actual slot owned by Schedule) ──
  intendedDay?: string                         // ISO date, e.g. "2025-09-05"
  intendedLocationId?: string
  performanceDurationMin?: number
  performanceNote?: string

  // ── Advancing checklist state ──────────────────────────────────────
  /** Keys reference `Event.artistChecklistTemplate[].id`. */
  checklist: { [itemId: string]: ChecklistEntry }

  // ── Generic / forward-compat ───────────────────────────────────────
  comment?: string
  customAttributes?: { [key: string]: unknown }

  // ── Lifecycle ──────────────────────────────────────────────────────
  createdAt: Timestamp
  createdBy: string
  updatedAt: Timestamp
  updatedBy: string
  deletedAt: Timestamp | null
}

/**
 * Append-only audit subcollection. One row per field change, written
 * by the mutation composables.
 */
export type ActivityLogEntry = {
  uid: string
  at: Timestamp
  /** Dot-path, e.g. `"status"` or `"fee.amount"`. */
  field: string
  before: unknown
  after: unknown
}
