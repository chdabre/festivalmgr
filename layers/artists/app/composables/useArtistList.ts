import { useCollection, useFirestore } from 'vuefire'
import { collection, orderBy, query, where, type QueryConstraint } from 'firebase/firestore'
import type { Artist, ArtistStatus } from '#layers/artists/shared/types'

export type ArtistListFilter = {
  status?: ArtistStatus[]
  category?: string[]
  responsibleUserId?: string
}

/**
 * Realtime list of non-deleted artists for an event. Default sort:
 * statusChangedAt ascending (oldest waiting first), filtered by
 * `deletedAt == null`. Status / category / responsibleUserId filters
 * are AND'd together.
 *
 * Note: when both `status` and `category` filters are present, Firestore
 * requires a composite index — see Task 13.
 */
export function useArtistList(
  orgId: string,
  eventId: string,
  filter: ArtistListFilter = {},
) {
  const db = useFirestore()
  const constraints: QueryConstraint[] = [where('deletedAt', '==', null)]
  if (filter.status && filter.status.length > 0) {
    constraints.push(where('status', 'in', filter.status))
  }
  if (filter.category && filter.category.length > 0) {
    constraints.push(where('category', 'in', filter.category))
  }
  if (filter.responsibleUserId) {
    constraints.push(where('responsibleUserId', '==', filter.responsibleUserId))
  }
  constraints.push(orderBy('statusChangedAt', 'asc'))
  const ref = collection(db, 'organizations', orgId, 'events', eventId, 'artists')
  return useCollection<Artist>(query(ref, ...constraints))
}
