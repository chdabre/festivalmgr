import { useCollection, useFirestore } from 'vuefire'
import { collection, limit, orderBy, query } from 'firebase/firestore'
import type { ActivityLogEntry } from '#layers/artists/shared/types'

/**
 * Last N audit entries for an artist. Default 20 — matches the spec §9b
 * "Activity (last 20)" panel on the detail page.
 */
export function useArtistActivity(
  orgId: string,
  eventId: string,
  artistId: string,
  options: { max?: number } = {},
) {
  const db = useFirestore()
  const ref = collection(db, 'organizations', orgId, 'events', eventId, 'artists', artistId, 'activity')
  return useCollection<ActivityLogEntry>(
    query(ref, orderBy('at', 'desc'), limit(options.max ?? 20)),
  )
}
