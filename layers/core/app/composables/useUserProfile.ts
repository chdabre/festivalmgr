import { computed } from 'vue'
import { useCurrentUser, useDocument, useFirestore } from 'vuefire'
import { doc } from 'firebase/firestore'
import type { User } from '#layers/core/shared/types'

export function useUserProfile() {
  const auth = useCurrentUser()
  const db = useFirestore()
  const docRef = computed(() =>
    auth.value ? doc(db, 'users', auth.value.uid) : null,
  )
  return useDocument<User>(docRef)
}
