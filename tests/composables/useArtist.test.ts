import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'

const docMock = vi.fn((..._args: unknown[]) => ({ path: 'organizations/lila/events/lila-2025/artists/a1' }))

vi.mock('firebase/firestore', () => ({
  doc: (...a: unknown[]) => docMock(...a),
}))
vi.mock('vuefire', () => ({
  useFirestore: () => ({}),
  useDocument: vi.fn(() => ref({
    name: 'ARXX', status: 'confirmed', category: 'Musikact', deletedAt: null,
  })),
}))

import { useArtist } from '#layers/artists/app/composables/useArtist'

describe('useArtist', () => {
  it('builds a doc ref to the right path and returns the live document', () => {
    const artist = useArtist('lila', 'lila-2025', 'a1')
    expect(docMock).toHaveBeenCalledWith({}, 'organizations', 'lila', 'events', 'lila-2025', 'artists', 'a1')
    expect(artist.value?.name).toBe('ARXX')
  })
})
