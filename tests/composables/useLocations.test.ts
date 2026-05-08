import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'

vi.mock('vuefire', () => ({
  useFirestore: () => ({}),
  useCollection: vi.fn(() => ref([
    { name: 'Aktionshalle', order: 1 },
    { name: 'Clubraum',     order: 2 },
  ])),
}))
vi.mock('firebase/firestore', () => ({
  collection: (..._args: unknown[]) => ({ path: '...' }),
  query: (...args: unknown[]) => args,
  orderBy: (...args: unknown[]) => ({ orderBy: args }),
}))

import { useLocations } from '#layers/core/app/composables/useLocations'

describe('useLocations', () => {
  it('returns ordered locations for the event', () => {
    const locs = useLocations('lila', 'lila-2025')
    expect(locs.value.map((l: { name: string }) => l.name)).toEqual(['Aktionshalle', 'Clubraum'])
  })
})
