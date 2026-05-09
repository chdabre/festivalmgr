import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'

const idTokenResult = {
  claims: { orgId: 'lila', role: 'director', orgs: { lila: 'director' } },
}

vi.mock('vuefire', () => ({
  useCurrentUser: vi.fn(() => ref({
    uid: 'u1',
    getIdTokenResult: vi.fn(async () => idTokenResult),
  })),
  // null skips the onIdTokenChanged subscription branch in the composable
  useFirebaseAuth: () => null,
}))
vi.mock('firebase/auth', () => ({
  onIdTokenChanged: vi.fn(() => () => {}),
}))

import { useFmgrClaims } from '#layers/core/app/composables/useFmgrClaims'

describe('useFmgrClaims (client branch)', () => {
  it('returns the orgId, role and orgs from the current user token', async () => {
    const claims = await useFmgrClaims()
    expect(claims.value).toMatchObject({
      orgId: 'lila',
      role: 'director',
      orgs: { lila: 'director' },
    })
  })

  it('returns null when no user is signed in', async () => {
    const { useCurrentUser } = await import('vuefire')
    const stub = vi.mocked(useCurrentUser as () => ReturnType<typeof ref>)
    stub.mockReturnValueOnce(ref(null))
    const claims = await useFmgrClaims()
    expect(claims.value).toBeNull()
  })
})
