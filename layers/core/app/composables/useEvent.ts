import { useDocument, useFirestore } from 'vuefire'
import { doc } from 'firebase/firestore'
import type { Event } from '#layers/core/shared/types'

export function useEvent(orgId: string, eventId: string) {
  const db = useFirestore()
  return useDocument<Event>(doc(db, 'organizations', orgId, 'events', eventId))
}
