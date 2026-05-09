import { computed } from 'vue'
import { useDocument, useFirestore } from 'vuefire'
import { doc } from 'firebase/firestore'
import { useFmgrClaims } from './useFmgrClaims'
import type { Organization } from '#layers/core/shared/types'

export async function useOrg() {
  const claims = await useFmgrClaims()
  const db = useFirestore()

  const orgId = computed(() => claims.value?.orgId ?? null)
  const role = computed(() => claims.value?.role ?? null)

  const orgRef = computed(() =>
    orgId.value ? doc(db, 'organizations', orgId.value) : null,
  )
  const org = useDocument<Organization>(orgRef)

  return { orgId, role, org }
}
