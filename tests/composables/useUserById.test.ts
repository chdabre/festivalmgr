import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'

const docMock = vi.fn((..._a: unknown[]) => ({ kind: 'doc', args: _a }))

vi.mock('firebase/firestore', () => ({
  doc: (...a: unknown[]) => docMock(...a),
}))
vi.mock('vuefire', () => ({
  useFirestore: () => ({}),
  useDocument: vi.fn((refOrComputed: unknown) => {
    const v = (refOrComputed as { value?: unknown }).value
    if (!v) return ref(null)
    return ref({ email: 'd@example.com', displayName: 'Director', orgIds: ['lila'] })
  }),
}))

import { useUserById } from '#layers/core/app/composables/useUserById'

describe('useUserById', () => {
  it('returns the user doc when uid is provided', () => {
    const u = useUserById('dirA')
    expect(docMock).toHaveBeenCalledWith({}, 'users', 'dirA')
    expect(u.value?.displayName).toBe('Director')
  })

  it('returns null when uid is null/undefined', () => {
    const u = useUserById(null)
    expect(u.value).toBeNull()
  })
})
