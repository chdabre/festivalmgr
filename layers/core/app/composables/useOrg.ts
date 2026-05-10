import { computed, ref, type Ref } from 'vue'
import { useDocument, useFirestore } from 'vuefire'
import { doc } from 'firebase/firestore'
import { useFmgrClaims } from './useFmgrClaims'
import type { Organization } from '#layers/core/shared/types'

/**
 * Active org context for the current request.
 *
 * On SSR we resolve `orgId` / `role` from the decoded session-cookie
 * claims (via `useFmgrClaims`) but skip the Firestore `org` doc
 * subscription — nuxt-vuefire doesn't initialize the client Firebase
 * app on the server, so calling `useFirestore()` there would throw
 * "No Firebase App '[DEFAULT]' has been created". Consumers should
 * treat `org.value` as nullable; the realtime subscription kicks in
 * on the client after hydration.
 */
export async function useOrg() {
  const claims = await useFmgrClaims()

  const orgId = computed(() => claims.value?.orgId ?? null)
  const role = computed(() => claims.value?.role ?? null)

  if (import.meta.server) {
    const org = ref<Organization | null>(null) as Ref<Organization | null>
    return { orgId, role, org }
  }

  const db = useFirestore()
  const orgRef = computed(() =>
    orgId.value ? doc(db, 'organizations', orgId.value) : null,
  )
  const org = useDocument<Organization>(orgRef)

  return { orgId, role, org }
}
