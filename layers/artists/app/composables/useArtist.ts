import { useDocument, useFirestore } from 'vuefire'
import { doc } from 'firebase/firestore'
import type { Artist } from '#layers/artists/shared/types'

/**
 * Realtime single-document subscription. Returns vuefire's `Ref<Artist | null>`
 * — null while the doc loads or if it doesn't exist.
 */
export function useArtist(orgId: string, eventId: string, artistId: string) {
  const db = useFirestore()
  return useDocument<Artist>(
    doc(db, 'organizations', orgId, 'events', eventId, 'artists', artistId),
  )
}
