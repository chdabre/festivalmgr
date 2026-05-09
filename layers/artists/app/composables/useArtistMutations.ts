import { useCurrentUser, useFirestore } from 'vuefire'
import {
  addDoc, collection, doc, serverTimestamp, setDoc, Timestamp, updateDoc,
} from 'firebase/firestore'
import type { Artist, ArtistStatus } from '#layers/artists/shared/types'

type ArtistCreateInput = {
  name: string
  category: string
} & Partial<Pick<Artist,
  | 'links'
  | 'origin'
  | 'shortDescription'
  | 'primaryContact'
  | 'responsibleUserId'
  | 'fee'
  | 'travelBudget'
  | 'accommodation'
  | 'daysPresent'
  | 'dealNotes'
  | 'intendedDay'
  | 'intendedLocationId'
  | 'performanceDurationMin'
  | 'performanceNote'
  | 'comment'
  | 'customAttributes'
>>

/**
 * Mutations for an artist collection. Every write also appends one entry
 * to /artists/{id}/activity/ for each changed field — the activity log is
 * the source-of-truth for the detail page's "Activity" panel.
 */
export function useArtistMutations(orgId: string, eventId: string) {
  const db = useFirestore()
  const user = useCurrentUser()
  const uid = () => user.value?.uid ?? 'anonymous'

  const artistsRef = collection(db, 'organizations', orgId, 'events', eventId, 'artists')

  async function logActivity(
    artistId: string,
    entries: Array<{ field: string; before: unknown; after: unknown }>,
  ) {
    const activityRef = collection(artistsRef, artistId, 'activity')
    for (const e of entries) {
      await addDoc(activityRef, {
        uid: uid(),
        at: serverTimestamp(),
        field: e.field,
        before: e.before,
        after: e.after,
      })
    }
  }

  async function createArtist(input: ArtistCreateInput) {
    const now = serverTimestamp()
    const payload = {
      ...input,
      links: input.links ?? {},
      status: 'planned' as ArtistStatus,
      statusChangedAt: Timestamp.now(),
      checklist: {},
      createdAt: now,
      createdBy: uid(),
      updatedAt: now,
      updatedBy: uid(),
      deletedAt: null,
      // responsibleUserId defaults to creator if not provided — matches
      // the "Add artist" UX in the spec §9a.
      responsibleUserId: input.responsibleUserId ?? uid(),
    }
    return addDoc(artistsRef, payload)
  }

  async function updateArtist(
    artistId: string,
    patch: Partial<Artist>,
    /** Pass the previous values so the activity log can record before/after. */
    before: Partial<Artist> = {},
  ) {
    const ref = doc(artistsRef, artistId)
    await updateDoc(ref, {
      ...patch,
      updatedAt: serverTimestamp(),
      updatedBy: uid(),
    })
    const entries = Object.keys(patch).map((field) => ({
      field,
      before: (before as Record<string, unknown>)[field],
      after: (patch as Record<string, unknown>)[field],
    }))
    await logActivity(artistId, entries)
  }

  async function softDeleteArtist(artistId: string) {
    const ref = doc(artistsRef, artistId)
    await updateDoc(ref, {
      deletedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedBy: uid(),
    })
  }

  async function transitionStatus(
    artistId: string,
    next: ArtistStatus,
    previous: ArtistStatus,
  ) {
    const ref = doc(artistsRef, artistId)
    await updateDoc(ref, {
      status: next,
      statusChangedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedBy: uid(),
    })
    await logActivity(artistId, [{ field: 'status', before: previous, after: next }])
  }

  return { createArtist, updateArtist, softDeleteArtist, transitionStatus }
}
