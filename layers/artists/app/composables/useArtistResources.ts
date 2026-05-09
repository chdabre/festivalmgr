// layers/artists/app/composables/useArtistResources.ts
import { useCurrentUser, useFirestore } from 'vuefire'
import { doc, serverTimestamp, Timestamp, updateDoc } from 'firebase/firestore'
import type { ResourceLink } from '#layers/artists/shared/types'

function inferKind(url: string): 'file' | 'folder' | undefined {
  if (/drive\.google\.com\/drive\/folders\//.test(url)) return 'folder'
  if (/drive\.google\.com\/file\//.test(url)) return 'file'
  return undefined
}

/**
 * Add / remove resource links on a specific checklist item.
 *
 * Caller passes the CURRENT resources array from the artist doc; we
 * compute the new array and write it via a field-path update. This avoids
 * the read-then-write race that an arrayUnion-on-an-array-of-objects
 * approach would hit (Firestore arrayUnion compares by deep-equality, so
 * `addedAt: serverTimestamp()` would defeat dedup).
 */
export function useArtistResources(orgId: string, eventId: string, artistId: string) {
  const db = useFirestore()
  const user = useCurrentUser()
  const ref = doc(db, 'organizations', orgId, 'events', eventId, 'artists', artistId)

  async function addResource(
    itemId: string,
    input: { url: string; title?: string; kind?: 'file' | 'folder' },
    currentResources: ResourceLink[],
  ) {
    const next: ResourceLink = {
      url: input.url,
      title: input.title,
      kind: input.kind ?? inferKind(input.url),
      addedBy: user.value?.uid ?? 'anonymous',
      addedAt: Timestamp.now(),
    }
    const newList = [...currentResources, next]
    await updateDoc(ref, {
      [`checklist.${itemId}.resources`]: newList,
      updatedAt: serverTimestamp(),
      updatedBy: user.value?.uid ?? 'anonymous',
    })
  }

  async function removeResource(
    itemId: string,
    url: string,
    currentResources: ResourceLink[],
  ) {
    const newList = currentResources.filter((r) => r.url !== url)
    await updateDoc(ref, {
      [`checklist.${itemId}.resources`]: newList,
      updatedAt: serverTimestamp(),
      updatedBy: user.value?.uid ?? 'anonymous',
    })
  }

  return { addResource, removeResource }
}
