import { computed } from 'vue'
import { useDocument, useFirestore } from 'vuefire'
import { doc } from 'firebase/firestore'
import type { ChecklistItemConfig, Event } from '#layers/core/shared/types'
import type { Artist, ChecklistEntry } from '#layers/artists/shared/types'

export type EvaluatedChecklistItem = ChecklistItemConfig & {
  done: boolean
  autoSatisfied?: boolean
  entry?: ChecklistEntry
}

/**
 * Reads the per-event checklist template + exposes a pure evaluator that
 * filters items by the artist's category and computes per-item `done`
 * (manual checkbox OR satisfied requirement).
 *
 * UI consumes `items` to render the settings page (ordered template) and
 * `evaluateForArtist(artist)` to render the artist's per-item state.
 */
export function useArtistChecklistTemplate(orgId: string, eventId: string) {
  const db = useFirestore()
  const event = useDocument<Event>(
    doc(db, 'organizations', orgId, 'events', eventId),
  )

  const items = computed(() => {
    const list = event.value?.artistChecklistTemplate ?? []
    return [...list].sort((a, b) => a.order - b.order)
  })

  function evaluateForArtist(artist: Pick<Artist, 'category' | 'checklist'>): EvaluatedChecklistItem[] {
    return items.value
      .filter((item) =>
        !item.appliesToCategories || item.appliesToCategories.includes(artist.category),
      )
      .map((item) => {
        const entry = artist.checklist?.[item.id]
        if (item.requirement?.type === 'resource') {
          const has = (entry?.resources?.length ?? 0) > 0
          return { ...item, entry, done: has, autoSatisfied: has }
        }
        return { ...item, entry, done: entry?.done ?? false }
      })
  }

  return { items, evaluateForArtist }
}
