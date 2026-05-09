import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'

const idTokenResult = { claims: { orgId: 'lila', role: 'director' } }

vi.mock('vuefire', () => ({
  useCurrentUser: () => ref({
    uid: 'u1',
    getIdTokenResult: vi.fn(async () => idTokenResult),
  }),
  // useOrg subscribes to onIdTokenChanged on the auth instance to pick up
  // claim refreshes (see comment in useOrg.ts). The composable is a no-op on
  // the server, but the test runs in node + import.meta.client is undefined,
  // so returning null is enough to skip the subscription branch.
  useFirebaseAuth: () => null,
  useFirestore: () => ({}),
  useDocument: vi.fn(() => ref({ name: 'lila. queer festival e.V.', slug: 'lila' })),
}))
vi.mock('firebase/firestore', () => ({
  doc: (..._args: unknown[]) => ({ path: 'organizations/lila' }),
}))
vi.mock('firebase/auth', () => ({
  onIdTokenChanged: vi.fn(() => () => {}),
}))

import { useOrg } from '#layers/core/app/composables/useOrg'

describe('useOrg', () => {
  it('returns the current org doc derived from the user claim', async () => {
    const { org, role, orgId } = await useOrg()
    expect(orgId.value).toBe('lila')
    expect(role.value).toBe('director')
    expect(org.value).toMatchObject({ name: 'lila. queer festival e.V.' })
  })
})
