import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'

const collectionMock = vi.fn((..._args: unknown[]) => ({ path: 'organizations/lila/events/lila-2025/artists' }))
const queryMock      = vi.fn((..._args: unknown[]) => ({ kind: 'q', args: _args }))
const whereMock      = vi.fn((field: string, op: string, value: unknown) => ({ where: { field, op, value } }))
const orderByMock    = vi.fn((field: string, dir?: string) => ({ orderBy: { field, dir } }))

vi.mock('firebase/firestore', () => ({
  collection: (...a: unknown[]) => collectionMock(...a),
  query:      (...a: unknown[]) => queryMock(...a),
  where:      (...a: unknown[]) => whereMock(a[0] as string, a[1] as string, a[2]),
  orderBy:    (...a: unknown[]) => orderByMock(a[0] as string, a[1] as string | undefined),
}))
vi.mock('vuefire', () => ({
  useFirestore: () => ({}),
  useCollection: vi.fn(() => ref([
    { id: 'a1', name: 'ARXX', status: 'confirmed', deletedAt: null },
  ])),
}))

import { useArtistList } from '#layers/artists/app/composables/useArtistList'

describe('useArtistList', () => {
  it('builds a query scoped to the org/event with deletedAt filter', () => {
    const list = useArtistList('lila', 'lila-2025')
    expect(collectionMock).toHaveBeenCalledWith({}, 'organizations', 'lila', 'events', 'lila-2025', 'artists')
    expect(whereMock).toHaveBeenCalledWith('deletedAt', '==', null)
    expect(list.value).toHaveLength(1)
  })

  it('adds status filter when provided', () => {
    useArtistList('lila', 'lila-2025', { status: ['planned', 'inquired'] })
    expect(whereMock).toHaveBeenCalledWith('status', 'in', ['planned', 'inquired'])
  })

  it('adds responsibleUserId filter when provided', () => {
    useArtistList('lila', 'lila-2025', { responsibleUserId: 'u1' })
    expect(whereMock).toHaveBeenCalledWith('responsibleUserId', '==', 'u1')
  })
})
