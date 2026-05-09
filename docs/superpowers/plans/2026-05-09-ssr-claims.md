# SSR Custom-Claims Plumbing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the SSR-side custom-claims gap so `useOrg` reports the same `orgId`/`role` on server and client renders, eliminating the "No organization yet" flash on first sign-in render and the hydration mismatch on `/settings` reload.

**Architecture:** A new server plugin reads the `__session` cookie on every SSR request, decodes the JWT payload, and writes `event.context.fmgrClaims`. A new `useFmgrClaims()` composable hides the SSR/client branch — on server it reads from `event.context.fmgrClaims`, on client from `auth.currentUser.getIdTokenResult().claims`. `useOrg` is refactored to consume `useFmgrClaims`. The fix is fully sidestepping nuxt-vuefire's claims-less `createCustomToken(uid)` on SSR — we don't depend on or override its private `DECODED_ID_TOKEN_SYMBOL`.

**Tech Stack:** Nuxt 4, vuefire, h3 cookies, Firebase Auth (client SDK), Vue 3 reactivity, Vitest.

**Reference spec:** [docs/superpowers/specs/2026-05-09-ssr-claims-design.md](../specs/2026-05-09-ssr-claims-design.md)

**Spec deviation noted upfront:** The spec §4.3 said `useOrg` would "lose its async". We're keeping it async (and `useFmgrClaims` async too) so that callers `<script setup> const { ... } = await useOrg()` continue to work and the page suspends until claims are populated — no flicker. The spec's intent (consume `useFmgrClaims`, drop `getIdTokenResult` direct calls) is preserved.

---

## File Structure (created/modified in this plan)

```
festivalmgr/
├── layers/core/
│   ├── app/
│   │   ├── composables/
│   │   │   ├── useFmgrClaims.ts                  [NEW]
│   │   │   └── useOrg.ts                         [REFACTORED]
│   │   ├── pages/
│   │   │   ├── index.vue                         [no change — still `await useOrg()`]
│   │   │   ├── settings/index.vue                [no change]
│   │   │   ├── settings/members.vue              [no change]
│   │   │   ├── events/index.vue                  [no change]
│   │   │   └── events/[eventId].vue              [no change]
│   │   └── plugins/
│   │       └── ssr-claims.server.ts              [NEW]
│   └── shared/
│       └── types/
│           └── h3.d.ts                           [NEW]
└── tests/
    └── composables/
        ├── useFmgrClaims.test.ts                 [NEW]
        └── useOrg.test.ts                        [MODIFIED — drop getIdTokenResult mock; mock useFmgrClaims]
```

---

## Task 1: Type augmentation for `H3EventContext`

**Files:**
- Create: `layers/core/shared/types/h3.d.ts`

This task adds the type info so TypeScript knows about `event.context.fmgrClaims` and `event.context.user` (the latter has been used since Plan A's middleware fix but never declared, relying on H3's loose indexer).

- [ ] **Step 1: Create `layers/core/shared/types/h3.d.ts`**

```ts
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
```

The trailing `export {}` makes this a module file (otherwise the `import type` lines would be reinterpreted as global script imports).

- [ ] **Step 2: Run `pnpm nuxt prepare` to verify Nuxt picks up the augmentation**

```bash
pnpm exec nuxt prepare 2>&1 | tail -5
```

Expected: `◆ Types generated in .nuxt.` and no errors. If TypeScript complains about the `import type` paths, it's a tsconfig issue — Nuxt 4 picks up `layers/<name>/shared/**/*.ts` by default.

- [ ] **Step 3: Verify the augmentation is visible**

```bash
echo 'import type { H3EventContext } from "h3"; const _: H3EventContext = { fmgrClaims: { orgId: "x" } };' > /tmp/typecheck-h3.ts
pnpm exec tsc --noEmit --target esnext --module esnext --moduleResolution bundler /tmp/typecheck-h3.ts 2>&1 | head -10
rm -f /tmp/typecheck-h3.ts
```

Expected: no errors. Confirms the augmentation is reachable from any TS file in the project.

- [ ] **Step 4: Commit**

```bash
git add layers/core/shared/types/h3.d.ts
git commit -m "feat(types): augment H3EventContext with user + fmgrClaims fields"
```

---

## Task 2: `useFmgrClaims` composable + tests (TDD, client branch)

**Files:**
- Create: `layers/core/app/composables/useFmgrClaims.ts`
- Create: `tests/composables/useFmgrClaims.test.ts`

The composable returns a `Ref<FmgrClaims | null>`. On SSR, it reads from `event.context.fmgrClaims` (sync, no await needed). On client, it reads from the user's ID token (async first pull, then reactive on token changes).

We test only the client branch in the unit test (the SSR branch is verified via the smoke check in Task 5 — testing it in vitest would require setting up a Nuxt-aware test env we don't have today).

- [ ] **Step 1: Write the failing test for the client branch**

Create `tests/composables/useFmgrClaims.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'

const idTokenResult = {
  claims: { orgId: 'lila', role: 'director', orgs: { lila: 'director' } },
}

vi.mock('vuefire', () => ({
  useCurrentUser: () => ref({
    uid: 'u1',
    getIdTokenResult: vi.fn(async () => idTokenResult),
  }),
  // null skips the onIdTokenChanged subscription branch in the composable
  useFirebaseAuth: () => null,
}))
vi.mock('firebase/auth', () => ({
  onIdTokenChanged: vi.fn(() => () => {}),
}))

import { useFmgrClaims } from '#layers/core/app/composables/useFmgrClaims'

describe('useFmgrClaims (client branch)', () => {
  it('returns the orgId, role and orgs from the current user token', async () => {
    const claims = await useFmgrClaims()
    expect(claims.value).toMatchObject({
      orgId: 'lila',
      role: 'director',
      orgs: { lila: 'director' },
    })
  })

  it('returns null when no user is signed in', async () => {
    const { useCurrentUser } = await import('vuefire')
    const stub = vi.mocked(useCurrentUser as () => ReturnType<typeof ref>)
    stub.mockReturnValueOnce(ref(null))
    const claims = await useFmgrClaims()
    expect(claims.value).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm test --reporter=verbose tests/composables/useFmgrClaims.test.ts 2>&1 | tail -10
```

Expected: `FAIL` with `Cannot find module '#layers/core/app/composables/useFmgrClaims'` (or similar — the composable doesn't exist yet).

- [ ] **Step 3: Create the composable**

Create `layers/core/app/composables/useFmgrClaims.ts`:

```ts
import { onScopeDispose, ref, watch } from 'vue'
import { onIdTokenChanged } from 'firebase/auth'
import { useCurrentUser, useFirebaseAuth } from 'vuefire'
import type { Role } from '#layers/core/shared/types'

export type FmgrClaims = {
  orgId?: string
  role?: Role
  orgs?: Record<string, Role>
}

/**
 * Returns the active Firebase Auth custom claims (orgId, role, orgs) as a
 * reactive ref.
 *
 * SSR branch: reads `event.context.fmgrClaims` (set by
 * `layers/core/app/plugins/ssr-claims.server.ts` from the __session cookie).
 *
 * Client branch: reads `auth.currentUser.getIdTokenResult().claims` and
 * subscribes to `onIdTokenChanged` so claims stay fresh when the token is
 * refreshed (e.g. after `claimMembership` activates a pending membership).
 *
 * The first pull is awaited so callers `const { ... } = await useFmgrClaims()`
 * see populated claims in their setup function — no flicker on first render.
 */
export async function useFmgrClaims() {
  if (import.meta.server) {
    const event = useRequestEvent()
    return ref<FmgrClaims | null>(event?.context.fmgrClaims ?? null)
  }

  const user = useCurrentUser()
  const auth = useFirebaseAuth()
  const claims = ref<FmgrClaims | null>(null)

  async function pull() {
    if (!user.value) {
      claims.value = null
      return
    }
    const { claims: c } = await user.value.getIdTokenResult()
    claims.value = {
      orgId: c.orgId as string | undefined,
      role: c.role as Role | undefined,
      orgs: c.orgs as Record<string, Role> | undefined,
    }
  }

  await pull()
  watch(user, pull)

  if (auth) {
    const stop = onIdTokenChanged(auth, pull)
    onScopeDispose(stop)
  }

  return claims
}
```

`useRequestEvent` is auto-imported by Nuxt at runtime; in unit tests we never reach the SSR branch (`import.meta.server` is undefined in vitest's node env), so the auto-import isn't invoked there.

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm test --reporter=verbose tests/composables/useFmgrClaims.test.ts 2>&1 | tail -10
```

Expected: `2 passed`.

- [ ] **Step 5: Commit**

```bash
git add layers/core/app/composables/useFmgrClaims.ts tests/composables/useFmgrClaims.test.ts
git commit -m "feat(core): add useFmgrClaims composable + client-branch tests"
```

---

## Task 3: SSR-side cookie-decoding plugin

**Files:**
- Create: `layers/core/app/plugins/ssr-claims.server.ts`

Server-only plugin runs once per request. Reads `__session`, decodes the JWT payload, writes `event.context.fmgrClaims`. We don't verify the signature on read — the cookie was minted by `/api/__session` after `firebase-admin.verifyIdToken` validated the original ID token, and the cookie is HttpOnly + (Secure-in-prod) + SameSite=Lax. Same trust model as nuxt-vuefire's own `decodeSessionCookie`.

- [ ] **Step 1: Create `layers/core/app/plugins/ssr-claims.server.ts`**

```ts
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
  if (parts.length < 2) return

  try {
    const padded = parts[1] + '='.repeat((-parts[1].length) % 4)
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
```

- [ ] **Step 2: Verify the plugin loads in Nuxt's plugin manifest**

```bash
pnpm exec nuxt prepare 2>&1 | tail -3
grep -c 'ssr-claims.server' .nuxt/types/plugins.d.ts
```

Expected: `1` — the plugin appears once in the generated manifest. (If 0, the file path or filename was wrong; layer plugins must be under `layers/<name>/app/plugins/` and end with `.server.ts` for server-only.)

- [ ] **Step 3: Run typecheck to make sure types resolve**

```bash
pnpm typecheck 2>&1 | tail -5
```

Expected: no errors. Confirms `event.context.fmgrClaims` is correctly typed (Task 1's augmentation in effect) and `getCookie` from `h3` is reachable.

- [ ] **Step 4: Commit**

```bash
git add layers/core/app/plugins/ssr-claims.server.ts
git commit -m "feat(core): add ssr-claims.server plugin to decode __session cookie"
```

---

## Task 4: Refactor `useOrg` to consume `useFmgrClaims`

**Files:**
- Modify: `layers/core/app/composables/useOrg.ts`
- Modify: `tests/composables/useOrg.test.ts`

`useOrg` becomes pure orchestration: read claims from `useFmgrClaims`, derive `orgId`/`role` as computed refs, look up the org doc. Loses its `getIdTokenResult` call, its `onIdTokenChanged` subscription (now in `useFmgrClaims`), and its internal `refresh()` function.

- [ ] **Step 1: Update the existing `useOrg.test.ts` mock**

Replace the contents of `tests/composables/useOrg.test.ts` with:

```ts
import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'

vi.mock('#layers/core/app/composables/useFmgrClaims', () => ({
  useFmgrClaims: async () => ref({
    orgId: 'lila',
    role: 'director',
    orgs: { lila: 'director' },
  }),
}))
vi.mock('vuefire', () => ({
  useFirestore: () => ({}),
  useDocument: vi.fn(() => ref({ name: 'lila. queer festival e.V.', slug: 'lila' })),
}))
vi.mock('firebase/firestore', () => ({
  doc: (..._args: unknown[]) => ({ path: 'organizations/lila' }),
}))

import { useOrg } from '#layers/core/app/composables/useOrg'

describe('useOrg', () => {
  it('returns the current org doc derived from the claims composable', async () => {
    const { org, role, orgId } = await useOrg()
    expect(orgId.value).toBe('lila')
    expect(role.value).toBe('director')
    expect(org.value).toMatchObject({ name: 'lila. queer festival e.V.' })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm test --reporter=verbose tests/composables/useOrg.test.ts 2>&1 | tail -10
```

Expected: FAIL — likely `[vitest] No "useCurrentUser" export is defined on the "vuefire" mock` (current `useOrg.ts` still imports `useCurrentUser` and `useFirebaseAuth` from vuefire).

- [ ] **Step 3: Refactor `useOrg.ts`**

Replace the contents of `layers/core/app/composables/useOrg.ts` with:

```ts
import { computed } from 'vue'
import { useDocument, useFirestore } from 'vuefire'
import { doc } from 'firebase/firestore'
import { useFmgrClaims } from './useFmgrClaims'
import type { Organization } from '#layers/core/shared/types'

export async function useOrg() {
  const claims = await useFmgrClaims()
  const db = useFirestore()

  const orgId = computed(() => claims.value?.orgId ?? null)
  const role = computed(() => claims.value?.role ?? null)

  const orgRef = computed(() =>
    orgId.value ? doc(db, 'organizations', orgId.value) : null,
  )
  const org = useDocument<Organization>(orgRef)

  return { orgId, role, org }
}
```

The function stays `async` (preserves the `await useOrg()` pattern in callers and the suspense-on-claims behavior — claims are populated before the function returns). The returned `orgId` and `role` are `ComputedRef` instead of plain `Ref` now, but the destructured `.value` access in pages works identically.

- [ ] **Step 4: Run the useOrg test to verify it passes**

```bash
pnpm test --reporter=verbose tests/composables/useOrg.test.ts 2>&1 | tail -10
```

Expected: `1 passed`.

- [ ] **Step 5: Run the full composable test suite**

```bash
pnpm test 2>&1 | tail -15
```

Expected: all 5 suites pass (`useEvents`, `useLocations`, `useUserProfile`, `useFmgrClaims`, `useOrg`).

- [ ] **Step 6: Run typecheck on the whole project**

```bash
pnpm typecheck 2>&1 | tail -5
```

Expected: no errors. Confirms the page callers (`<script setup> const { orgId, role } = await useOrg()`) still typecheck — the destructured fields match (`orgId`, `role`, `org` are all returned).

- [ ] **Step 7: Commit**

```bash
git add layers/core/app/composables/useOrg.ts tests/composables/useOrg.test.ts
git commit -m "refactor(core): useOrg consumes useFmgrClaims; SSR + client claims unified"
```

---

## Task 5: End-to-end smoke check

A manual pass via chrome-devtools-mcp to verify the SSR-side claims actually flow through. We're testing the three failure modes the spec calls out: first-render-after-signin, hard-reload-/settings (hydration), and SSR-rendered HTML containing the org content.

- [ ] **Step 1: Start dev**

In a separate terminal (so the assertion commands below don't deadlock):

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home
export PATH=$JAVA_HOME/bin:$PATH
pnpm dev
```

Wait until you see `[wait-for-emulators] hub reports: auth, firestore, functions, storage` and `Local: http://localhost:3000/`.

- [ ] **Step 2: Reseed**

```bash
pnpm dev:seed
```

Expected: `Seeded emulator: org=lila, director=director@example.com, event=lila-2025, 2 locations.`

- [ ] **Step 3: Sign in fresh as director (drive via chrome-devtools-mcp)**

Use the Chrome DevTools MCP to:
1. Open `http://localhost:3000/login`.
2. Fill `you@example.com` field with `director@example.com`, click "Send sign-in link".
3. Fetch the OOB link from the auth emulator:
   ```bash
   curl -fsS 'http://127.0.0.1:9099/emulator/v1/projects/demo-festivalmgr-dev/oobCodes' | python3 -c 'import sys,json; d=json.load(sys.stdin); cs=sorted([c for c in d["oobCodes"] if c["email"]=="director@example.com" and c["requestType"]=="EMAIL_SIGNIN"], key=lambda c: c["oobCode"]); print(cs[-1]["oobLink"])'
   ```
4. Navigate the browser to that URL.
5. Wait for redirect to `/`.

- [ ] **Step 4: Assert no flash and no hydration mismatch**

In the browser snapshot of `/`:
- Expected: `You're in lila. queer festival e.V. as director.` rendered immediately on first paint (no transition through "No organization yet").
- Console messages should have **zero** `Hydration ... mismatch` errors.

If an "AppShell — No organization yet" alert was rendered server-side and replaced after hydration, that's the existing bug — should not happen anymore.

- [ ] **Step 5: Hard-reload `/settings` and assert no hydration mismatch**

Drive the browser:
1. Click the "Settings" link in the AppShell.
2. Trigger a hard reload of `/settings` (`navigate_page reload`).
3. Wait for the page to be ready.

In the resulting snapshot:
- Expected: full settings form rendered (Name, Default locale, Default currency, Enabled modules checkboxes, Save button).
- Console: zero `Hydration ... mismatch` errors.

- [ ] **Step 6: Curl-verify SSR HTML contains org info**

In a fresh terminal:

```bash
# Sign up to the auth emulator + get an ID token
SIGNUP=$(curl -fsS -X POST 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-api-key' -H 'Content-Type: application/json' -d '{"email":"director@example.com","password":"test1234","returnSecureToken":true}' || curl -fsS -X POST 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key' -H 'Content-Type: application/json' -d '{"email":"director@example.com","password":"test1234","returnSecureToken":true}')
TOKEN=$(echo "$SIGNUP" | python3 -c 'import sys,json;print(json.load(sys.stdin)["idToken"])')

# Mint a session cookie
curl -sS -X POST http://localhost:3000/api/__session -H 'Content-Type: application/json' -d "{\"token\":\"$TOKEN\"}" -D /tmp/sess.headers -o /dev/null
COOKIE=$(grep -i '^set-cookie:.*__session=' /tmp/sess.headers | head -1 | sed -E 's/^[Ss]et-[Cc]ookie: ([^;]+).*/\1/')

# GET / with the cookie and grep the SSR-rendered HTML
curl -sS --cookie "$COOKIE" http://localhost:3000/ | grep -oE 'You.{1,80}as <strong>[^<]+|No organization yet'
```

Expected output: `You're in <strong>...lila...</strong> as <strong>director</strong>` (or similar — the SSR HTML contains the authenticated content directly, NOT the "No organization yet" alert).

If output contains `No organization yet`, the SSR plugin isn't decoding the cookie. Triage:
- Confirm `event.context.fmgrClaims` is set: add a `console.log` in the plugin and re-run.
- Confirm cookie has the expected payload by base64-decoding the middle segment manually.

- [ ] **Step 7: Stop dev**

```bash
pkill -f 'firebase emulators:start' 2>/dev/null
pkill -f 'nuxt dev' 2>/dev/null
pkill -f concurrently 2>/dev/null
```

---

## Task 6: Push branch + open PR + verify CI green + merge

The branch is `feat/ssr-claims`. CI runs the full pipeline (typecheck + composable tests + functions tests + rules:check) on push.

- [ ] **Step 1: Push the branch**

```bash
git push -u origin feat/ssr-claims 2>&1 | tail -3
```

- [ ] **Step 2: Open the PR via the GitHub MCP**

Use `mcp__github__create_pull_request` with:
- owner: `chdabre`
- repo: `festivalmgr`
- head: `feat/ssr-claims`
- base: `main`
- title: `fix(core): SSR custom-claims plumbing — close Plan A SSR gap`
- body (template):

```markdown
## Summary

Closes the SSR-side custom-claims gap that Plan B's smoke check
surfaced: nuxt-vuefire's SSR sign-in uses a claims-less custom
token, so server-rendered pages saw `orgId/role` as undefined and
flashed "No organization yet" on first sign-in / triggered hydration
mismatches on `/settings` reload.

## What's in the PR

- New `ssr-claims.server` plugin that decodes the `__session` cookie
  on every SSR request and writes `event.context.fmgrClaims`.
- New `useFmgrClaims()` composable that hides the SSR/client branch
  (server: read from event context; client: read from
  `getIdTokenResult().claims` + react to `onIdTokenChanged`).
- `useOrg` refactored to consume `useFmgrClaims` — pure orchestration
  now (read claims → derive `orgId`/`role` → fetch org doc).
- `H3EventContext` augmented with `user?: User` and `fmgrClaims?: …`
  so existing middleware reads typecheck cleanly.

## Test plan

- [x] `pnpm typecheck`
- [x] `pnpm test` — 5 suites, all passing
- [x] Smoke check via chrome-devtools-mcp:
  - Fresh sign-in → dashboard renders "You're in lila... as director"
    immediately, no flash
  - Hard reload of `/settings` → form renders cleanly, no hydration
    mismatch errors
  - `curl /` with `__session` cookie → SSR HTML contains the
    authenticated content
- [ ] CI green

Reference: [docs/superpowers/specs/2026-05-09-ssr-claims-design.md](docs/superpowers/specs/2026-05-09-ssr-claims-design.md), [docs/superpowers/plans/2026-05-09-ssr-claims.md](docs/superpowers/plans/2026-05-09-ssr-claims.md).
```

- [ ] **Step 3: Watch CI**

Poll the workflow status:

```bash
curl -fsS -H "Accept: application/vnd.github+json" "https://api.github.com/repos/chdabre/festivalmgr/actions/runs?per_page=2" > /tmp/runs.json
python3 -c 'import json; [print(f"#{r[\"run_number\"]} sha={r[\"head_sha\"][:8]} status={r[\"status\"]} conclusion={r[\"conclusion\"]}") for r in json.load(open("/tmp/runs.json"))["workflow_runs"]]'
```

Wait until the latest run on the branch's commit is `completed` + `success`. Typically ~3–4 minutes (cache is warm from Plan B).

- [ ] **Step 4: Merge the PR**

```bash
# via GitHub MCP
```

Use `mcp__github__merge_pull_request` with `merge_method: "squash"` and the PR number returned by step 2.

- [ ] **Step 5: Update local main**

```bash
git checkout main && git pull origin main 2>&1 | tail -3
```

---

## Plan complete

After all tasks check off:
- The "No organization yet" flash on first sign-in render is gone.
- `/settings` hard-reload renders cleanly with no hydration mismatch.
- SSR-rendered HTML contains the authenticated content.
- Future module composables (`useArtists` permissions, `useBudget` role gates) consume `useFmgrClaims` directly — no SSR/client branching boilerplate per composable.

**Next:** Artists module brainstorm (the spreadsheet replacement, foundation §13 module #1).
