/**
 * Per-event configurable checklist template. Authored on the Event doc;
 * per-artist state lives on each Artist's `checklist` map.
 *
 * `id` is stable and never reused — deleting an item leaves orphan state in
 * existing artist docs but the UI hides it (recoverable if the delete was a
 * mistake).
 */
export type ChecklistRequirement = { type: 'resource' }

export type ChecklistItemConfig = {
  id: string
  label: string
  description?: string
  order: number
  /** When set, only artists whose `category` is in this list see this item. */
  appliesToCategories?: string[]
  /** When set to `{ type: 'resource' }`, the item auto-satisfies once ≥1 resource is linked. */
  requirement?: ChecklistRequirement
}
