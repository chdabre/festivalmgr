import { computed } from 'vue'
import { useCurrentUser, useDocument, useFirestore } from 'vuefire'
import { doc } from 'firebase/firestore'
import type { User } from '#layers/core/shared/types'

export function useUserProfile() {
  const auth = useCurrentUser()
  const db = useFirestore()
  const profile = computed(() => {
    if (!auth.value) return null
    return useDocument<User>(doc(db, 'users', auth.value.uid))
  })
  return computed(() => profile.value?.value ?? null)
}
