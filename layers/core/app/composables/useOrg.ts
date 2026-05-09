import { ref, computed, watch, onScopeDispose } from 'vue'
import { useCurrentUser, useDocument, useFirebaseAuth, useFirestore } from 'vuefire'
import { doc } from 'firebase/firestore'
import { onIdTokenChanged } from 'firebase/auth'
import type { Organization, Role } from '#layers/core/shared/types'

export async function useOrg() {
  const user = useCurrentUser()
  const auth = useFirebaseAuth()
  const db = useFirestore()

  const orgId = ref<string | null>(null)
  const role = ref<Role | null>(null)

  async function refresh() {
    if (!user.value) {
      orgId.value = null
      role.value = null
      return
    }
    const t = await user.value.getIdTokenResult()
    orgId.value = (t.claims.orgId as string) ?? null
    role.value = (t.claims.role as Role) ?? null
  }

  await refresh()
  watch(user, refresh)

  // The user ref doesn't re-emit when only the ID token changes (e.g. after
  // claimMembership sets new custom claims and we force-refresh the token).
  // Subscribe to token changes so role/orgId stay in sync with the latest claims.
  if (import.meta.client && auth) {
    const stop = onIdTokenChanged(auth, () => { refresh() })
    onScopeDispose(stop)
  }

  const orgRef = computed(() =>
    orgId.value ? doc(db, 'organizations', orgId.value) : null,
  )
  const org = useDocument<Organization>(orgRef)

  return { orgId, role, org, refresh }
}
