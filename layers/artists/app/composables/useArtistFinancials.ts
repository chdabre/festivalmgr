import { computed } from 'vue'
import { useCollection, useFirestore } from 'vuefire'
import { collection, query, where } from 'firebase/firestore'
import type { Artist } from '#layers/artists/shared/types'

/**
 * Read-side rollup: sums fees + travel budgets over artists that are
 * `inquired` or `confirmed` (declined/cancelled/soft-deleted excluded).
 *
 * v1 sums numeric amounts naively across currencies — Budget UI is
 * expected to surface mismatches via `mixedCurrencyArtists`.
 */
export function useArtistFinancials(
  orgId: string,
  eventId: string,
  options: { defaultCurrency?: string } = {},
) {
  const db = useFirestore()
  const ref = collection(db, 'organizations', orgId, 'events', eventId, 'artists')
  const raw = useCollection<Artist>(
    query(
      ref,
      where('deletedAt', '==', null),
      where('status', 'in', ['inquired', 'confirmed']),
    ),
  )

  // Defensive client-side filter: keep only inquired+confirmed and exclude
  // soft-deleted rows even if the upstream query is mis-shaped.
  const artists = computed(() =>
    raw.value.filter(
      (a) =>
        !a.deletedAt &&
        (a.status === 'inquired' || a.status === 'confirmed'),
    ),
  )

  const totalFee = computed(() =>
    artists.value.reduce((acc, a) => acc + (a.fee?.amount ?? 0), 0),
  )

  const totalTravel = computed(() =>
    artists.value.reduce((acc, a) => acc + (a.travelBudget?.amount ?? 0), 0),
  )

  const feeByCategory = computed(() => {
    const out: Record<string, number> = {}
    for (const a of artists.value) {
      const k = a.category
      out[k] = (out[k] ?? 0) + (a.fee?.amount ?? 0)
    }
    return out
  })

  const mixedCurrencyArtists = computed(() => {
    const def = options.defaultCurrency
    if (!def) return []
    return artists.value.filter((a) => {
      const fc = a.fee?.currency
      const tc = a.travelBudget?.currency
      return (fc && fc !== def) || (tc && tc !== def)
    })
  })

  return { artists, totalFee, totalTravel, feeByCategory, mixedCurrencyArtists }
}
