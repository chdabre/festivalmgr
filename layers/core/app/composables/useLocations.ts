import { useCollection, useFirestore } from 'vuefire'
import { collection, query, orderBy } from 'firebase/firestore'
import type { Location } from '#layers/core/shared/types'

export function useLocations(orgId: string, eventId: string) {
  const db = useFirestore()
  const ref = collection(db, 'organizations', orgId, 'events', eventId, 'locations')
  return useCollection<Location>(query(ref, orderBy('order', 'asc')))
}
