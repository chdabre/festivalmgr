import type { Timestamp } from 'firebase/firestore'

export type Role = 'director' | 'booker' | 'production' | 'finance' | 'pr' | 'crew'

export type Membership = {
  userId: string | null
  email: string
  role: Role
  invitedBy: string
  invitedAt: Timestamp
  acceptedAt: Timestamp | null
  status: 'pending' | 'active' | 'revoked'
}
