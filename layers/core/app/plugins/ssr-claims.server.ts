import { getCookie } from 'h3'
import type { Role } from '#layers/core/shared/types'

/**
 * Decodes the __session cookie (a Firebase session JWT) on every SSR
 * request and exposes the developer claims (orgId, role, orgs) on
 * `event.context.fmgrClaims`. Runs after nuxt-vuefire's auth plugins so
 * the cookie is already minted/validated by the time we read it.
 *
 * Trust: the cookie was set by /api/__session only after
 * firebase-admin.verifyIdToken succeeded. We don't re-verify the
 * signature here — same model as vuefire's decodeSessionCookie.
 */
export default defineNuxtPlugin(() => {
  const event = useRequestEvent()
  if (!event) return

  const cookie = getCookie(event, '__session')
  if (!cookie) return

  const parts = cookie.split('.')
  const payload = parts[1]
  if (!payload) return

  try {
    const padded = payload + '='.repeat((-payload.length) % 4)
    const json = Buffer.from(
      padded.replace(/-/g, '+').replace(/_/g, '/'),
      'base64',
    ).toString('utf8')
    const p = JSON.parse(json) as Record<string, unknown>
    event.context.fmgrClaims = {
      orgId: typeof p.orgId === 'string' ? p.orgId : undefined,
      role: typeof p.role === 'string' ? (p.role as Role) : undefined,
      orgs:
        p.orgs && typeof p.orgs === 'object'
          ? (p.orgs as Record<string, Role>)
          : undefined,
    }
  }
  catch {
    // Malformed cookie — leave fmgrClaims unset. The auth middleware
    // redirects to /login if claims are required for the route.
  }
})
