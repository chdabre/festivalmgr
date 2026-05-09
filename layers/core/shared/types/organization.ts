import type { Timestamp } from 'firebase/firestore'

export type ModuleKey = 'artists' | 'budget' | 'booking' | 'riders' | 'schedule'

export type Organization = {
  name: string
  slug: string
  defaultLocale: string
  defaultCurrency: string
  enabledModules: ModuleKey[]
  /**
   * Optional per-org list of artist-category suggestions. UI offers them as
   * suggestions but `Artist.category` remains free-form so a typo doesn't
   * block creation. Default: empty / undefined.
   */
  artistCategories?: string[]
  branding?: {
    logoStoragePath?: string
    primaryColor?: string
  }
  createdAt: Timestamp
}
