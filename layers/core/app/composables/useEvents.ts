import { useCollection, useFirestore } from 'vuefire'
import { collection, query, where, orderBy } from 'firebase/firestore'
import type { Event } from '#layers/core/shared/types'

export function useEvents(orgId: string) {
  const db = useFirestore()
  const ref = collection(db, 'organizations', orgId, 'events')
  return useCollection<Event>(
    query(ref, where('deletedAt', '==', null), orderBy('dates.start', 'desc')),
  )
}
