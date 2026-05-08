import { ref, computed, watch } from 'vue'
import { useCurrentUser, useDocument, useFirestore } from 'vuefire'
import { doc } from 'firebase/firestore'
import type { Organization, Role } from '#layers/core/shared/types'

export async function useOrg() {
  const user = useCurrentUser()
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

  const orgRef = computed(() =>
    orgId.value ? doc(db, 'organizations', orgId.value) : null,
  )
  const org = useDocument<Organization>(orgRef)

  return { orgId, role, org, refresh }
}
