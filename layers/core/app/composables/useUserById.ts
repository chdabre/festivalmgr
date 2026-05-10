import { computed } from 'vue'
import { useDocument, useFirestore } from 'vuefire'
import { doc } from 'firebase/firestore'
import type { User } from '#layers/core/shared/types'

/**
 * Read a global user profile by uid. Returns vuefire's `Ref<User | null>`
 * — null while loading or if the doc doesn't exist (e.g., a uid from a
 * deleted user). Cross-tenant lookups deny per the rules at users/{uid}.
 */
export function useUserById(uid: string | null | undefined) {
  const db = useFirestore()
  const docRef = computed(() => uid ? doc(db, 'users', uid) : null)
  return useDocument<User>(docRef)
}
