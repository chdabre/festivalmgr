import { useCollection, useFirestore } from 'vuefire'
import { collection } from 'firebase/firestore'
import type { Membership } from '#layers/core/shared/types'

export function useMemberships(orgId: string) {
  const db = useFirestore()
  const ref = collection(db, 'organizations', orgId, 'memberships')
  return useCollection<Membership>(ref)
}
