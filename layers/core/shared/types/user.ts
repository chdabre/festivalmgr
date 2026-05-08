import type { Timestamp } from 'firebase/firestore'

export type User = {
  email: string
  displayName: string
  photoURL?: string
  orgIds: string[]
  createdAt: Timestamp
}
