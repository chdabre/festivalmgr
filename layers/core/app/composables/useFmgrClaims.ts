import { onScopeDispose, ref, watch } from 'vue'
import { onIdTokenChanged } from 'firebase/auth'
import { useCurrentUser, useFirebaseAuth } from 'vuefire'
import type { Role } from '#layers/core/shared/types'

export type FmgrClaims = {
  orgId?: string
  role?: Role
  orgs?: Record<string, Role>
}

/**
 * Returns the active Firebase Auth custom claims (orgId, role, orgs) as a
 * reactive ref.
 *
 * SSR branch: reads `event.context.fmgrClaims` (set by
 * `layers/core/app/plugins/ssr-claims.server.ts` from the __session cookie).
 *
 * Client branch: reads `auth.currentUser.getIdTokenResult().claims` and
 * subscribes to `onIdTokenChanged` so claims stay fresh when the token is
 * refreshed (e.g. after `claimMembership` activates a pending membership).
 *
 * The first pull is awaited so callers `const { ... } = await useFmgrClaims()`
 * see populated claims in their setup function — no flicker on first render.
 */
export async function useFmgrClaims() {
  if (import.meta.server) {
    const event = useRequestEvent()
    return ref<FmgrClaims | null>(event?.context.fmgrClaims ?? null)
  }

  const user = useCurrentUser()
  const auth = useFirebaseAuth()
  const claims = ref<FmgrClaims | null>(null)

  async function pull(forceRefresh = false) {
    if (!user.value) {
      claims.value = null
      return
    }
    const { claims: c } = await user.value.getIdTokenResult(forceRefresh)
    claims.value = {
      orgId: c.orgId as string | undefined,
      role: c.role as Role | undefined,
      orgs: c.orgs as Record<string, Role> | undefined,
    }
  }

  // Register listeners BEFORE the first await so onScopeDispose is captured
  // by the active effect scope (after an await Vue's scope is detached and
  // onScopeDispose becomes a no-op).
  watch(user, () => pull())
  if (auth) {
    const stop = onIdTokenChanged(auth, () => pull())
    onScopeDispose(stop)
  }

  // Initial pull with forceRefresh — directly after a magic-link sign-in the
  // cached token can be the pre-claim one (mint-cookie.client.ts is racing
  // its own force-refresh in parallel). Forcing here guarantees fresh claims
  // even if our onIdTokenChanged listener missed the refresh event.
  await pull(true)

  return claims
}
