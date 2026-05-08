import type { Timestamp } from 'firebase/firestore'

export type ModuleKey = 'artists' | 'budget' | 'booking' | 'riders' | 'schedule'

export type Organization = {
  name: string
  slug: string
  defaultLocale: string
  defaultCurrency: string
  enabledModules: ModuleKey[]
  branding?: {
    logoStoragePath?: string
    primaryColor?: string
  }
  createdAt: Timestamp
}
