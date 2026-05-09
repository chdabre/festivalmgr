# SSR Custom-Claims Plumbing

**Status:** Draft for approval
**Date:** 2026-05-09
**Scope:** Close the SSR-side custom-claims gap left by Plan A: server-rendered pages currently see no `orgId`/`role` claims because nuxt-vuefire's SSR sign-in uses a claims-less custom token. This spec describes a small, central fix that surfaces the claims uniformly on both sides.

## 1. Overview

Plan A relies on Firebase Auth custom claims (`orgId`, `role`, `orgs`) to gate every per-org collection in `useOrg` and the rules. On the **client**, `auth.currentUser.getIdTokenResult().claims` returns the claims we set in `setMembership` / `claimMembership`. On the **server**, nuxt-vuefire signs the SSR-side user in via `adminAuth.createCustomToken(uid)` — note the missing second argument — so the resulting SDK user has no developer claims, and `getIdTokenResult` reports an empty `claims` object.

The visible symptom: pages that read claims during `<script setup>` render with `orgId=null` on the server, then with the real value on the client, producing hydration mismatches and a flash of the "No organization yet" alert. Plan B's smoke check exposed this on `/settings` reload and on the first render after a magic-link sign-in.

This spec ships a server plugin that reads the `__session` cookie directly and exposes the decoded claims via a `useFmgrClaims()` composable. `useOrg` consumes the composable, and future module composables (`useArtists` permissions, `useBudget` role gates) consume the same one.

## 2. Goals and non-goals

### Goals
- `useOrg().orgId` and `.role` return the same values on SSR and client for the same authenticated user.
- One central place to read claims (`useFmgrClaims`) so future composables don't repeat the SSR/client branching dance.
- No hydration mismatch on `/settings` reload (or any other page that reads claims during SSR).
- No new runtime cost beyond a single cookie read + JWT-payload base64 decode per request.

### Non-goals
- **Patching nuxt-vuefire upstream.** We don't depend on or override its private `DECODED_ID_TOKEN_SYMBOL`. We re-decode the cookie ourselves.
- **Server-side token verification on every read.** The `__session` cookie was minted by `/api/__session` only after `firebase-admin.verifyIdToken(token)` succeeded. The cookie is HttpOnly + Secure (in prod) + SameSite=Lax. We trust it on read, same as `decodeSessionCookie` does.
- **Resolving the underlying nuxt-vuefire `createCustomToken(uid)` bug.** That requires either a vuefire PR (out of scope) or monkey-patching `node_modules` (brittle). Reading the cookie ourselves sidesteps it.
- **Making the client-side `useOrg` reactivity smarter.** The existing `onIdTokenChanged` subscription (Plan A's prior fix) is hoisted into `useFmgrClaims`; behavior unchanged.

## 3. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ Per-request SSR flow                                            │
│                                                                 │
│   Request hits Nuxt                                             │
│     ↓                                                           │
│   nuxt-vuefire plugin-user-token.server                         │
│     reads __session cookie via verifySessionCookie              │
│     sets nuxtApp[DECODED_ID_TOKEN_SYMBOL] (private to vuefire)  │
│     ↓                                                           │
│   nuxt-vuefire plugin-authenticate-user.server                  │
│     creates a claims-less custom token, signs in the SDK user,  │
│     sets event.context.user (claims-less SDK user)              │
│     ↓                                                           │
│   layers/core/app/plugins/ssr-claims.server.ts  ← NEW           │
│     reads __session cookie directly from H3 event               │
│     decodes JWT payload (no signature verify — already done     │
│     upstream by /api/__session) and pulls { orgId, role, orgs } │
│     writes event.context.fmgrClaims = {...}                     │
│     ↓                                                           │
│   Page setup runs                                               │
│     useOrg() calls useFmgrClaims()                              │
│       SSR branch:    useRequestEvent().context.fmgrClaims       │
│       Client branch: user.getIdTokenResult().claims             │
│     orgId / role populated identically on both sides            │
│     → no hydration mismatch                                     │
└─────────────────────────────────────────────────────────────────┘
```

## 4. Components

### 4.1 New: `layers/core/app/plugins/ssr-claims.server.ts`

Server-only Nuxt plugin. Runs once per request (after nuxt-vuefire's plugins, by registration order — layer `app/plugins/` always run after module-added plugins). Reads `__session`, decodes the JWT payload, writes `event.context.fmgrClaims`.

Skeleton:

```ts
import type { Role } from '#layers/core/shared/types'

export default defineNuxtPlugin(() => {
  const event = useRequestEvent()
  if (!event) return                                       // SSG / no request
  const cookie = getCookie(event, '__session')
  if (!cookie) return                                      // anonymous request
  const parts = cookie.split('.')
  if (parts.length < 2) return                             // malformed
  try {
    const padded = parts[1] + '='.repeat((-parts[1].length) % 4)
    const json = Buffer.from(
      padded.replace(/-/g, '+').replace(/_/g, '/'),
      'base64',
    ).toString('utf8')
    const p = JSON.parse(json) as Record<string, unknown>
    event.context.fmgrClaims = {
      orgId: typeof p.orgId === 'string' ? p.orgId : undefined,
      role:  typeof p.role  === 'string' ? (p.role as Role) : undefined,
      orgs:  p.orgs && typeof p.orgs === 'object'
               ? (p.orgs as Record<string, Role>) : undefined,
    }
  } catch {
    // Malformed payload — leave fmgrClaims unset. Auth middleware will
    // redirect to /login if claims are required.
  }
})
```

### 4.2 New: `layers/core/app/composables/useFmgrClaims.ts`

Hides the SSR/client branch. Returns a `Ref<FmgrClaims | null>`.

```ts
import { onScopeDispose, ref } from 'vue'
import { onIdTokenChanged } from 'firebase/auth'
import { useCurrentUser, useFirebaseAuth } from 'vuefire'
import type { Role } from '#layers/core/shared/types'

export type FmgrClaims = {
  orgId?: string
  role?: Role
  orgs?: Record<string, Role>
}

export function useFmgrClaims() {
  if (import.meta.server) {
    const event = useRequestEvent()
    return ref<FmgrClaims | null>(event?.context.fmgrClaims ?? null)
  }

  const user = useCurrentUser()
  const auth = useFirebaseAuth()
  const claims = ref<FmgrClaims | null>(null)

  async function pull() {
    if (!user.value) { claims.value = null; return }
    const { claims: c } = await user.value.getIdTokenResult()
    claims.value = {
      orgId: c.orgId as string | undefined,
      role:  c.role  as Role   | undefined,
      orgs:  c.orgs  as Record<string, Role> | undefined,
    }
  }

  // Initial pull + react to user changes
  watchEffect(pull)
  // React to client-side token refresh (claimMembership, etc.)
  if (auth) {
    const stop = onIdTokenChanged(auth, pull)
    onScopeDispose(stop)
  }
  return claims
}
```

### 4.3 Modified: `layers/core/app/composables/useOrg.ts`

Replace the direct `getIdTokenResult` call with `useFmgrClaims`. `useOrg` becomes pure orchestration: read claims → look up the org doc.

```ts
import { computed, ref, watchEffect } from 'vue'
import { useDocument, useFirestore } from 'vuefire'
import { doc } from 'firebase/firestore'
import { useFmgrClaims } from './useFmgrClaims'
import type { Organization } from '#layers/core/shared/types'

export function useOrg() {
  const claims = useFmgrClaims()
  const db = useFirestore()
  const orgId = computed(() => claims.value?.orgId ?? null)
  const role  = computed(() => claims.value?.role  ?? null)
  const orgRef = computed(() =>
    orgId.value ? doc(db, 'organizations', orgId.value) : null,
  )
  const org = useDocument<Organization>(orgRef)
  return { orgId, role, org }
}
```

The function loses its `async` and `await refresh()` ceremony — `useFmgrClaims` returns synchronously on SSR and refs into reactivity on client. **Caller change**: `const { org, role } = await useOrg()` → `const { org, role } = useOrg()` in `app/pages/index.vue` and `app/pages/settings/*.vue` and `app/pages/events/*.vue` and the `useEvent` composable. The `await` becomes unnecessary; removing it is a one-line edit per caller.

### 4.4 Modified: `layers/core/shared/types/h3.d.ts` (new)

Ambient module augmentation so TypeScript knows about `event.context.fmgrClaims` AND `event.context.user` (which Plan A's middleware already reads via the loose `H3EventContext` indexer):

```ts
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
```

### 4.5 Modified: `tests/composables/useOrg.test.ts`

Drop the `getIdTokenResult` mock; mock `useFmgrClaims` directly:

```ts
vi.mock('#layers/core/app/composables/useFmgrClaims', () => ({
  useFmgrClaims: () => ref({ orgId: 'lila', role: 'director' }),
}))
```

The vuefire mock loses `useFirebaseAuth` and `useCurrentUser` (no longer needed in `useOrg`).

### 4.6 New: `tests/composables/useFmgrClaims.test.ts`

Two cases:
- **SSR branch:** mock `useRequestEvent` to return `{ context: { fmgrClaims: {...} } }`, set `import.meta.server = true`, assert the ref has those claims.
- **Client branch:** mock `useCurrentUser` returning a user with `getIdTokenResult` resolving to `{ claims: { orgId, role } }`. Mock `useFirebaseAuth` returning null (skip onIdTokenChanged). Assert the ref populates after `await flushPromises()`.

## 5. Error handling

| Failure mode | Behavior |
|---|---|
| No `__session` cookie (anonymous SSR request) | `event.context.fmgrClaims = undefined`; `useFmgrClaims()` returns `ref(null)`; `useOrg` reports `orgId=null, role=null`; auth middleware redirects to `/login` (existing behavior). |
| Malformed cookie (not a 3-part JWT or invalid base64) | Same as above — caught in the `try`/`catch`; we don't crash the request, we don't guess. |
| Cookie present but missing `orgId`/`role` (user signed in but no active membership yet — pending invite) | `fmgrClaims = {}`; `useOrg` reports `orgId=null, role=null`; AppShell renders "No organization yet" alert (now cleanly on both server and client; no hydration mismatch). |
| Token signature tampering | We don't verify on read. The `__session` cookie was minted by `/api/__session` only after `firebase-admin.verifyIdToken(token)` validated the original ID token. The cookie is HttpOnly + Secure-in-prod + SameSite=Lax. Same trust model as nuxt-vuefire's own `decodeSessionCookie`, simpler implementation. |

## 6. Testing

- **Unit tests** as listed in §4.5 / §4.6.
- **Manual smoke (chrome-devtools):**
  - Sign in fresh as director via magic link. Confirm dashboard immediately shows "You're in lila... as director" — no flash of "No organization yet."
  - Hard-reload `/settings`. Confirm the form renders without hydration warnings in the console.
  - Run an authenticated `curl /` with the `__session` cookie. Confirm the SSR HTML contains "You're in lila..." (proof that the server saw the claims).
- **No new rules tests.** Behavior change is in app composables; rules are unchanged.

## 7. Out of scope

- **Module-specific permission helpers.** Each module's spec will define its own permission-check helpers built on top of `useFmgrClaims`. We don't pre-declare them here.
- **Multi-org `orgId` switching.** The `orgs` claim is exposed for forward-compat but no UI consumes it yet. Switching active org will be designed when a tenant needs multi-org membership.
- **Server-side `getCurrentUser` shim.** vuefire's `getCurrentUser()` still throws in route middleware on SSR (Plan B middleware fix sidesteps this with `event.context.user`). Replacing that pattern repo-wide is out of scope; keep the existing `import.meta.server` branch in middleware.

## 8. First implementation slice

The plan that flows from this design covers:
1. Type augmentation (`shared/types/h3.d.ts`).
2. `useFmgrClaims` composable + unit test (TDD).
3. `ssr-claims.server.ts` plugin.
4. Refactor `useOrg` to consume `useFmgrClaims`; drop `async` and update callers (`pages/index.vue`, `pages/settings/index.vue`, `pages/settings/members.vue`, `pages/events/index.vue`, `pages/events/[eventId].vue`). Five files; each is a one-line `await useOrg()` → `useOrg()` change.
5. Update existing `tests/composables/useOrg.test.ts` mock.
6. Manual smoke check via chrome-devtools (the three steps in §6).
7. PR + CI green.
