import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'

vi.mock('firebase/firestore', () => ({
  collection: (..._a: unknown[]) => ({}),
  query: (..._a: unknown[]) => ({}),
  where: (..._a: unknown[]) => ({}),
}))
vi.mock('vuefire', () => ({
  useFirestore: () => ({}),
  useCollection: vi.fn(() => ref([
    { name: 'A', status: 'inquired',  category: 'Musikact', fee: { amount: 500, currency: 'CHF' }, travelBudget: { amount: 100, currency: 'CHF' } },
    { name: 'B', status: 'confirmed', category: 'Musikact', fee: { amount: 700, currency: 'CHF' }, travelBudget: { amount: 200, currency: 'EUR' } },
    { name: 'C', status: 'confirmed', category: 'Theater',  fee: { amount: 300, currency: 'CHF' } },
    { name: 'D', status: 'declined',  category: 'Musikact', fee: { amount: 999, currency: 'CHF' } },
  ])),
}))

import { useArtistFinancials } from '#layers/artists/app/composables/useArtistFinancials'

describe('useArtistFinancials', () => {
  it('totals fee + travelBudget over inquired+confirmed only', () => {
    const r = useArtistFinancials('lila', 'lila-2025')
    expect(r.totalFee.value).toBe(1500)        // 500 + 700 + 300, declined excluded
    expect(r.totalTravel.value).toBe(300)      // 100 + 200 (currencies are summed naively in v1)
  })

  it('groups fee totals by category', () => {
    const r = useArtistFinancials('lila', 'lila-2025')
    expect(r.feeByCategory.value).toEqual({ Musikact: 1200, Theater: 300 })
  })

  it("flags currency mismatches when an artist's currency differs from the org default", () => {
    const r = useArtistFinancials('lila', 'lila-2025', { defaultCurrency: 'CHF' })
    expect(r.mixedCurrencyArtists.value.map((a) => a.name)).toEqual(['B'])
  })
})
