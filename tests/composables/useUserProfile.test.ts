import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'

vi.mock('vuefire', () => ({
  useCurrentUser: () => ref({ uid: 'u1' }),
  useFirestore: () => ({}),
  useDocument: vi.fn(() => ref({ email: 'a@b.c', displayName: 'A', orgIds: ['lila'] })),
}))
vi.mock('firebase/firestore', () => ({
  doc: (..._args: unknown[]) => ({ path: 'users/u1' }),
}))

import { useUserProfile } from '#layers/core/app/composables/useUserProfile'

describe('useUserProfile', () => {
  it('returns the current user profile reactively', () => {
    const profile = useUserProfile()
    expect(profile.value).toEqual({ email: 'a@b.c', displayName: 'A', orgIds: ['lila'] })
  })
})
