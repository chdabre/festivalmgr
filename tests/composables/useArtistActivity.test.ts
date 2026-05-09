import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'

const collectionMock = vi.fn((..._a: unknown[]) => ({}))
const queryMock      = vi.fn((..._a: unknown[]) => ({}))
const orderByMock    = vi.fn((field: string, dir: string) => ({ field, dir }))
const limitMock      = vi.fn((n: number) => ({ limit: n }))

vi.mock('firebase/firestore', () => ({
  collection: (...a: unknown[]) => collectionMock(...a),
  query:      (...a: unknown[]) => queryMock(...a),
  orderBy:    (...a: unknown[]) => orderByMock(a[0] as string, a[1] as string),
  limit:      (n: number) => limitMock(n),
}))
vi.mock('vuefire', () => ({
  useFirestore: () => ({}),
  useCollection: vi.fn(() => ref([
    { uid: 'u1', field: 'status', before: 'planned', after: 'inquired' },
  ])),
}))

import { useArtistActivity } from '#layers/artists/app/composables/useArtistActivity'

describe('useArtistActivity', () => {
  it('subscribes to /artists/{id}/activity ordered by `at desc`, default limit 20', () => {
    const log = useArtistActivity('lila', 'lila-2025', 'a1')
    expect(collectionMock).toHaveBeenCalledWith({}, 'organizations', 'lila', 'events', 'lila-2025', 'artists', 'a1', 'activity')
    expect(orderByMock).toHaveBeenCalledWith('at', 'desc')
    expect(limitMock).toHaveBeenCalledWith(20)
    expect(log.value).toHaveLength(1)
  })

  it('honors a custom limit', () => {
    useArtistActivity('lila', 'lila-2025', 'a1', { max: 5 })
    expect(limitMock).toHaveBeenCalledWith(5)
  })
})
