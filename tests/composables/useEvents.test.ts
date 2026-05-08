import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'

vi.mock('vuefire', () => ({
  useFirestore: () => ({}),
  useCollection: vi.fn(() => ref([
    { name: 'lila. 2025', slug: 'lila-2025', deletedAt: null },
  ])),
}))
vi.mock('firebase/firestore', () => ({
  collection: (..._args: unknown[]) => ({ path: 'organizations/lila/events' }),
  query: (...args: unknown[]) => args,
  where: (...args: unknown[]) => ({ where: args }),
  orderBy: (...args: unknown[]) => ({ orderBy: args }),
}))

import { useEvents } from '#layers/core/app/composables/useEvents'

describe('useEvents', () => {
  it('lists non-deleted events for the given org', () => {
    const events = useEvents('lila')
    expect(events.value).toHaveLength(1)
    expect(events.value[0].slug).toBe('lila-2025')
  })
})
