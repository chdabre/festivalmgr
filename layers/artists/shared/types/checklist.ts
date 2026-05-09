import type { Timestamp } from 'firebase/firestore'

/**
 * Drive link (or other URL) attached to a checklist item. Storage uploads
 * are deferred to a later spec — v1 is link-only.
 */
export type ResourceLink = {
  url: string
  title?: string
  /** UI hint; user-set or inferred from URL pattern. */
  kind?: 'file' | 'folder'
  addedBy: string
  addedAt: Timestamp
}

/**
 * Per-artist state for one checklist template item. Keys reference
 * `Event.artistChecklistTemplate[].id`.
 */
export type ChecklistEntry = {
  /** Manual checkbox value, OR computed `true` when `requirement` is satisfied. */
  done: boolean
  /** True when a `requirement` (e.g. `{type:'resource'}`) is currently met. */
  autoSatisfied?: boolean
  doneAt?: Timestamp
  /** uid; null when auto-satisfied without a manual user click. */
  doneBy?: string
  /** Populated when the template item has `requirement.type === 'resource'`. */
  resources?: ResourceLink[]
  note?: string
}
