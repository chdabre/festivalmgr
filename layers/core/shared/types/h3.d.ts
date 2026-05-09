// Module augmentation for H3 — exposes the request-scoped fields that
// nuxt-vuefire's plugin-authenticate-user sets and that our own
// ssr-claims.server plugin sets.
import type { User } from 'firebase/auth'
import type { Role } from './membership'

declare module 'h3' {
  interface H3EventContext {
    user?: User
    fmgrClaims?: {
      orgId?: string
      role?: Role
      orgs?: Record<string, Role>
    }
  }
}

export {}
