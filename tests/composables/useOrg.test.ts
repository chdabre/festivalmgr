import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'

vi.mock('#layers/core/app/composables/useFmgrClaims', () => ({
  useFmgrClaims: async () => ref({
    orgId: 'lila',
    role: 'director',
    orgs: { lila: 'director' },
  }),
}))
vi.mock('vuefire', () => ({
  useFirestore: () => ({}),
  useDocument: vi.fn(() => ref({ name: 'lila. queer festival e.V.', slug: 'lila' })),
}))
vi.mock('firebase/firestore', () => ({
  doc: (..._args: unknown[]) => ({ path: 'organizations/lila' }),
}))

import { useOrg } from '#layers/core/app/composables/useOrg'

describe('useOrg', () => {
  it('returns the current org doc derived from the claims composable', async () => {
    const { org, role, orgId } = await useOrg()
    expect(orgId.value).toBe('lila')
    expect(role.value).toBe('director')
    expect(org.value).toMatchObject({ name: 'lila. queer festival e.V.' })
  })
})
