# festivalmgr — Bootstrap, Auth & Member Admin Implementation Plan (Plan A of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Nuxt + Firebase repo skeleton, the `core` Nuxt layer with shared types and composables, the Cloud Functions for membership lifecycle, and the screens for login + org settings + member admin + events + locations — all running locally against the Firebase Emulator Suite.

**Architecture:** Modular monolith. Single Nuxt 3 + Nuxt UI app with `core` as a Nuxt layer; single Firebase project (Firestore + Auth + Functions + Storage). Frontend talks directly to Firestore via the client SDK; Cloud Functions handle only what requires server trust (membership writes, claim sync). Permissive starter rules in this plan; locked-down rules and tests come in Plan B.

**Tech Stack:** Nuxt 3, Nuxt UI, TypeScript, Firebase JS SDK v10+, Firebase Functions v2 (TS), Firebase Emulator Suite, Vitest, `@nuxtjs/i18n`, `pnpm`.

**Reference spec:** [docs/superpowers/specs/2026-05-08-festivalmgr-platform-foundation-design.md](../specs/2026-05-08-festivalmgr-platform-foundation-design.md)

**Out of scope (deferred to Plan B / Plan C):** layered firestore.rules + tests; staging/prod GitHub Actions; Netlify production config; daily Firestore backup. This plan ships permissive starter rules used only against emulators.

---

## File Structure (created in this plan)

```
festivalmgr/
├── package.json
├── pnpm-workspace.yaml
├── nuxt.config.ts
├── app.vue
├── tsconfig.json
├── vitest.config.ts
├── firebase.json
├── .firebaserc
├── firestore.rules                       (permissive starter — auth required only)
├── firestore.indexes.json                (empty for now)
├── storage.rules                         (permissive starter)
├── netlify.toml                          (dev-only config; prod settings in Plan C)
├── i18n/
│   └── en.json
├── functions/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   └── src/
│       ├── index.ts
│       ├── core/
│       │   ├── helpers.ts
│       │   ├── setMembership.ts
│       │   ├── revokeMembership.ts
│       │   └── onUserCreated.ts
│       └── test/
│           ├── setup.ts
│           ├── setMembership.test.ts
│           ├── revokeMembership.test.ts
│           └── onUserCreated.test.ts
├── layers/
│   └── core/
│       ├── nuxt.config.ts
│       ├── types/
│       │   ├── index.ts
│       │   ├── user.ts
│       │   ├── organization.ts
│       │   ├── membership.ts
│       │   ├── event.ts
│       │   └── location.ts
│       ├── plugins/
│       │   └── firebase.client.ts
│       ├── composables/
│       │   ├── useFirebase.ts
│       │   ├── useUser.ts
│       │   ├── useOrg.ts
│       │   ├── useMembership.ts
│       │   ├── useEvent.ts
│       │   └── useLocation.ts
│       ├── middleware/
│       │   └── auth.global.ts
│       ├── components/
│       │   ├── AppShell.vue
│       │   ├── MemberRow.vue
│       │   ├── EventCard.vue
│       │   └── LocationListItem.vue
│       └── pages/
│           ├── index.vue
│           ├── login.vue
│           ├── auth/
│           │   └── complete.vue
│           ├── settings/
│           │   ├── index.vue
│           │   └── members.vue
│           └── events/
│               ├── index.vue
│               └── [id].vue
├── scripts/
│   └── seed-director.ts
└── tests/
    └── composables/
        ├── useUser.test.ts
        ├── useOrg.test.ts
        ├── useMembership.test.ts
        ├── useEvent.test.ts
        └── useLocation.test.ts
```

---

## Task 1: Initialize Nuxt 3 project with Nuxt UI

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `nuxt.config.ts`, `app.vue`, `tsconfig.json`, `.gitignore`
- Create: `i18n/en.json`

- [ ] **Step 1: Init project with pnpm and install Nuxt + Nuxt UI**

```bash
cd /Users/chdabre/dev/festivalmgr
pnpm init
pnpm add nuxt @nuxt/ui vue vue-router
pnpm add -D typescript @types/node vitest @vitejs/plugin-vue happy-dom
```

- [ ] **Step 2: Write `pnpm-workspace.yaml` to declare the functions sub-package**

```yaml
packages:
  - '.'
  - 'functions'
```

- [ ] **Step 3: Write minimal `nuxt.config.ts`**

```ts
export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@nuxtjs/i18n'],
  extends: ['./layers/core'],
  i18n: {
    defaultLocale: 'en',
    locales: [{ code: 'en', file: 'en.json' }],
    langDir: 'i18n',
  },
  typescript: { strict: true },
  ssr: false, // SPA-mode for the auth-protected app; public pages opt back in later
  compatibilityDate: '2026-05-08',
})
```

- [ ] **Step 4: Add `@nuxtjs/i18n` dependency**

```bash
pnpm add @nuxtjs/i18n
```

- [ ] **Step 5: Write `app.vue` shell**

```vue
<template>
  <UApp>
    <NuxtPage />
  </UApp>
</template>
```

- [ ] **Step 6: Write `i18n/en.json` with the strings used by login + member admin pages**

```json
{
  "auth": {
    "loginTitle": "Sign in to festivalmgr",
    "magicLinkLabel": "Email",
    "magicLinkSubmit": "Send magic link",
    "magicLinkSent": "Check your inbox for a sign-in link.",
    "googleSubmit": "Continue with Google",
    "completing": "Completing sign-in…",
    "logout": "Sign out"
  },
  "members": {
    "title": "Members",
    "inviteHeading": "Invite a teammate",
    "emailLabel": "Email",
    "roleLabel": "Role",
    "inviteSubmit": "Send invite",
    "revokeAction": "Revoke",
    "pending": "Pending",
    "active": "Active",
    "revoked": "Revoked"
  },
  "events": {
    "title": "Events",
    "createButton": "New event",
    "nameLabel": "Name",
    "slugLabel": "URL slug",
    "startLabel": "Start date",
    "endLabel": "End date",
    "save": "Save"
  },
  "locations": {
    "title": "Locations",
    "createButton": "Add location",
    "nameLabel": "Name",
    "capacityLabel": "Capacity",
    "save": "Save",
    "delete": "Delete"
  },
  "settings": {
    "orgTitle": "Organization settings",
    "orgNameLabel": "Organization name",
    "save": "Save"
  }
}
```

- [ ] **Step 7: Write `tsconfig.json`**

```json
{
  "extends": "./.nuxt/tsconfig.json"
}
```

- [ ] **Step 8: Write `.gitignore`**

```
node_modules
.nuxt
.output
.netlify
.firebase
*.log
.env
.env.*
!.env.example
firebase-debug.log
ui-debug.log
firestore-debug.log
.DS_Store
coverage
dist
```

- [ ] **Step 9: Verify Nuxt boots**

```bash
pnpm exec nuxt prepare
```
Expected: completes without errors; creates `.nuxt/` directory.

- [ ] **Step 10: Commit**

```bash
git add package.json pnpm-workspace.yaml pnpm-lock.yaml nuxt.config.ts app.vue tsconfig.json .gitignore i18n/
git commit -m "chore: initialize Nuxt 3 + Nuxt UI project"
```

---

## Task 2: Configure Firebase + emulator with permissive starter rules

**Files:**
- Create: `firebase.json`, `.firebaserc`, `firestore.rules`, `firestore.indexes.json`, `storage.rules`, `netlify.toml`

- [ ] **Step 1: Install Firebase CLI globally if missing**

```bash
which firebase || pnpm add -g firebase-tools
firebase --version
```

- [ ] **Step 2: Write `.firebaserc` with project aliases**

```json
{
  "projects": {
    "default": "festivalmgr-dev",
    "dev": "festivalmgr-dev",
    "staging": "festivalmgr-staging",
    "prod": "festivalmgr-prod"
  }
}
```

> Real Firebase projects for staging/prod are created in Plan C. For Plan A, `festivalmgr-dev` is a placeholder ID — we never deploy to it; the emulator uses it only for local config consistency.

- [ ] **Step 3: Write `firebase.json`**

```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "storage": {
    "rules": "storage.rules"
  },
  "functions": {
    "source": "functions",
    "predeploy": ["pnpm --filter functions build"]
  },
  "emulators": {
    "auth":      { "port": 9099 },
    "firestore": { "port": 8080 },
    "functions": { "port": 5001 },
    "storage":   { "port": 9199 },
    "ui":        { "enabled": true, "port": 4000 },
    "singleProjectMode": true
  }
}
```

- [ ] **Step 4: Write `firestore.indexes.json` (empty starter)**

```json
{
  "indexes": [],
  "fieldOverrides": []
}
```

- [ ] **Step 5: Write permissive starter `firestore.rules`**

> These rules require auth but otherwise allow any authenticated user to read/write anything. Plan B replaces these with locked-down per-collection rules. They exist only so the app works against the emulator during Plan A development.

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

- [ ] **Step 6: Write permissive starter `storage.rules`**

```js
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

- [ ] **Step 7: Write `netlify.toml` (dev-only stub)**

```toml
[build]
  command = "pnpm build"
  publish = ".output/public"

[build.environment]
  NODE_VERSION = "20"
```

- [ ] **Step 8: Verify the emulator suite starts**

```bash
firebase emulators:start --only auth,firestore,storage --project festivalmgr-dev
```
Expected: Auth on 9099, Firestore on 8080, Storage on 9199, UI on 4000. Hit `Ctrl+C` to stop after verifying.

- [ ] **Step 9: Commit**

```bash
git add firebase.json .firebaserc firestore.rules firestore.indexes.json storage.rules netlify.toml
git commit -m "chore: configure firebase emulator suite with permissive starter rules"
```

---

## Task 3: Set up `layers/core` scaffold

**Files:**
- Create: `layers/core/nuxt.config.ts`

- [ ] **Step 1: Write `layers/core/nuxt.config.ts`**

```ts
export default defineNuxtConfig({
  components: [
    { path: '~/components', pathPrefix: false },
  ],
})
```

- [ ] **Step 2: Verify the layer is picked up**

```bash
pnpm exec nuxt prepare
```
Expected: completes without errors; `.nuxt/` regenerated.

- [ ] **Step 3: Commit**

```bash
git add layers/core/
git commit -m "chore: scaffold core nuxt layer"
```

---

## Task 4: Add core domain types

**Files:**
- Create: `layers/core/types/user.ts`, `organization.ts`, `membership.ts`, `event.ts`, `location.ts`, `index.ts`

- [ ] **Step 1: Write `layers/core/types/user.ts`**

```ts
import type { Timestamp } from 'firebase/firestore'

export interface User {
  email: string
  displayName: string
  photoURL?: string
  orgIds: string[]
  createdAt: Timestamp
}
```

- [ ] **Step 2: Write `layers/core/types/organization.ts`**

```ts
import type { Timestamp } from 'firebase/firestore'

export type ModuleKey = 'artists' | 'budget' | 'booking' | 'riders' | 'schedule'

export interface Organization {
  name: string
  slug: string
  defaultLocale: string
  defaultCurrency: string
  enabledModules: ModuleKey[]
  branding?: { logoStoragePath?: string; primaryColor?: string }
  createdAt: Timestamp
}
```

- [ ] **Step 3: Write `layers/core/types/membership.ts`**

```ts
import type { Timestamp } from 'firebase/firestore'

export type Role = 'director' | 'booker' | 'production' | 'finance' | 'pr' | 'crew'
export type MembershipStatus = 'pending' | 'active' | 'revoked'

export interface Membership {
  userId: string
  role: Role
  invitedBy: string
  invitedAt: Timestamp
  acceptedAt?: Timestamp
  status: MembershipStatus
}
```

- [ ] **Step 4: Write `layers/core/types/event.ts`**

```ts
import type { Timestamp } from 'firebase/firestore'

export type EventStatus = 'planning' | 'live' | 'archived'

export interface Event {
  name: string
  slug: string
  primaryLocale: string
  primaryContacts: string[]
  status: EventStatus
  dates: { start: Timestamp; end: Timestamp }
  publicSlug?: string
  publishToPublic: boolean
  createdAt: Timestamp
  deletedAt: Timestamp | null
}
```

- [ ] **Step 5: Write `layers/core/types/location.ts`**

```ts
export interface Location {
  name: string
  capacity?: number
  notes?: string
  order: number
}
```

- [ ] **Step 6: Write `layers/core/types/index.ts` re-export barrel**

```ts
export * from './user'
export * from './organization'
export * from './membership'
export * from './event'
export * from './location'
```

- [ ] **Step 7: Install Firebase JS SDK so `Timestamp` resolves**

```bash
pnpm add firebase
```

- [ ] **Step 8: Verify types compile**

```bash
pnpm exec nuxt prepare && pnpm exec tsc --noEmit
```
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add layers/core/types/ package.json pnpm-lock.yaml
git commit -m "feat(core): add core domain types"
```

---

## Task 5: Add Firebase client plugin (auth + firestore + functions, emulator-aware)

**Files:**
- Create: `layers/core/plugins/firebase.client.ts`

- [ ] **Step 1: Write the client-only plugin**

```ts
// layers/core/plugins/firebase.client.ts
import { initializeApp } from 'firebase/app'
import { getAuth, connectAuthEmulator } from 'firebase/auth'
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore'
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions'
import { getStorage, connectStorageEmulator } from 'firebase/storage'

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig().public.firebase
  const app = initializeApp(config)

  const auth = getAuth(app)
  const db = getFirestore(app)
  const functions = getFunctions(app)
  const storage = getStorage(app)

  if (import.meta.env.DEV || useRuntimeConfig().public.useEmulator) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
    connectFirestoreEmulator(db, '127.0.0.1', 8080)
    connectFunctionsEmulator(functions, '127.0.0.1', 5001)
    connectStorageEmulator(storage, '127.0.0.1', 9199)
  }

  return { provide: { firebase: { app, auth, db, functions, storage } } }
})
```

- [ ] **Step 2: Wire up runtime config in `nuxt.config.ts`**

Modify the existing `nuxt.config.ts` to add:

```ts
runtimeConfig: {
  public: {
    useEmulator: process.env.FIREBASE_USE_EMULATOR === '1',
    firebase: {
      apiKey: process.env.FIREBASE_API_KEY ?? 'demo-api-key',
      authDomain: process.env.FIREBASE_AUTH_DOMAIN ?? 'localhost',
      projectId: process.env.FIREBASE_PROJECT_ID ?? 'festivalmgr-dev',
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET ?? 'demo-bucket',
      appId: process.env.FIREBASE_APP_ID ?? 'demo-app',
    },
  },
},
```

- [ ] **Step 3: Add `.env.example`**

```
FIREBASE_USE_EMULATOR=1
FIREBASE_PROJECT_ID=festivalmgr-dev
FIREBASE_API_KEY=demo-api-key
FIREBASE_AUTH_DOMAIN=localhost
FIREBASE_STORAGE_BUCKET=demo-bucket
FIREBASE_APP_ID=demo-app
```

- [ ] **Step 4: Verify the plugin compiles**

```bash
pnpm exec nuxt prepare && pnpm exec tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add layers/core/plugins/firebase.client.ts nuxt.config.ts .env.example
git commit -m "feat(core): add firebase client plugin with emulator support"
```

---

## Task 6: Add `useUser` composable + tests

**Files:**
- Create: `layers/core/composables/useFirebase.ts`, `useUser.ts`
- Create: `vitest.config.ts`, `tests/composables/useUser.test.ts`

- [ ] **Step 1: Write `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: [],
  },
})
```

- [ ] **Step 2: Write the `useFirebase` helper**

```ts
// layers/core/composables/useFirebase.ts
export const useFirebase = () => {
  const { $firebase } = useNuxtApp()
  return $firebase
}
```

- [ ] **Step 3: Write the failing test for `useUser`**

```ts
// tests/composables/useUser.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'

const mockOnAuthStateChanged = vi.fn()
const mockSignOut = vi.fn()

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: mockOnAuthStateChanged,
  signOut: mockSignOut,
}))

vi.mock('#imports', () => ({
  useFirebase: () => ({ auth: { currentUser: null } }),
  useState: <T>(_k: string, init: () => T) => ref(init()),
}))

describe('useUser', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('exposes the current Firebase user as a ref', async () => {
    const { useUser } = await import('../../layers/core/composables/useUser')
    const { user } = useUser()
    expect(user.value).toBeNull()
  })

  it('updates the ref when onAuthStateChanged fires', async () => {
    let registered: (u: unknown) => void = () => {}
    mockOnAuthStateChanged.mockImplementation((_auth, cb) => { registered = cb; return () => {} })
    const { useUser } = await import('../../layers/core/composables/useUser')
    const { user } = useUser()
    registered({ uid: 'abc', email: 'sarah@example.com' })
    expect(user.value).toEqual({ uid: 'abc', email: 'sarah@example.com' })
  })

  it('signOut delegates to firebase/auth.signOut', async () => {
    const { useUser } = await import('../../layers/core/composables/useUser')
    const { signOut } = useUser()
    await signOut()
    expect(mockSignOut).toHaveBeenCalled()
  })
})
```

- [ ] **Step 4: Run test to verify it fails (composable does not exist)**

```bash
pnpm exec vitest run tests/composables/useUser.test.ts
```
Expected: FAIL — "Cannot find module '../../layers/core/composables/useUser'".

- [ ] **Step 5: Write `useUser` composable to make tests pass**

```ts
// layers/core/composables/useUser.ts
import { onAuthStateChanged, signOut as fbSignOut, type User as FbUser } from 'firebase/auth'

export const useUser = () => {
  const { auth } = useFirebase()
  const user = useState<FbUser | null>('fbUser', () => auth.currentUser)

  if (import.meta.client) {
    onAuthStateChanged(auth, (u) => { user.value = u })
  }

  const signOut = () => fbSignOut(auth)
  return { user, signOut }
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
pnpm exec vitest run tests/composables/useUser.test.ts
```
Expected: 3 passed.

- [ ] **Step 7: Add npm test script to `package.json`**

Modify `package.json` to add:

```json
"scripts": {
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 8: Commit**

```bash
git add layers/core/composables/ tests/ vitest.config.ts package.json
git commit -m "feat(core): add useUser composable"
```

---

## Task 7: Add `useOrg` and `useMembership` composables + tests

**Files:**
- Create: `layers/core/composables/useOrg.ts`, `useMembership.ts`
- Create: `tests/composables/useOrg.test.ts`, `useMembership.test.ts`

- [ ] **Step 1: Write the failing test for `useOrg`**

```ts
// tests/composables/useOrg.test.ts
import { describe, it, expect, vi } from 'vitest'

const mockDoc = vi.fn()
const mockOnSnapshot = vi.fn()
vi.mock('firebase/firestore', () => ({
  doc: (...a: unknown[]) => mockDoc(...a),
  onSnapshot: (...a: unknown[]) => mockOnSnapshot(...a),
}))
vi.mock('#imports', () => ({
  useFirebase: () => ({ db: { __db: true } }),
  useState: <T>(_k: string, init: () => T) => ({ value: init() }),
  useNuxtApp: () => ({ $firebase: { db: { __db: true } } }),
}))

describe('useOrg', () => {
  it('subscribes to /organizations/{orgId} and exposes ref', async () => {
    let snapHandler: (s: { exists: () => boolean; data: () => unknown }) => void = () => {}
    mockOnSnapshot.mockImplementation((_ref, cb) => { snapHandler = cb; return () => {} })
    mockDoc.mockReturnValue({ __ref: true })

    const { useOrg } = await import('../../layers/core/composables/useOrg')
    const { org, subscribe } = useOrg('lila')
    subscribe()
    snapHandler({ exists: () => true, data: () => ({ name: 'lila e.V.' }) })
    expect(org.value).toEqual({ name: 'lila e.V.' })
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm exec vitest run tests/composables/useOrg.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write `useOrg` composable**

```ts
// layers/core/composables/useOrg.ts
import { doc, onSnapshot } from 'firebase/firestore'
import type { Organization } from '../types'

export const useOrg = (orgId: string) => {
  const { db } = useFirebase()
  const org = useState<Organization | null>(`org:${orgId}`, () => null)

  const subscribe = () => {
    const ref = doc(db, 'organizations', orgId)
    return onSnapshot(ref, (snap) => {
      org.value = snap.exists() ? (snap.data() as Organization) : null
    })
  }

  return { org, subscribe }
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
pnpm exec vitest run tests/composables/useOrg.test.ts
```
Expected: 1 passed.

- [ ] **Step 5: Write the failing test for `useMembership`**

```ts
// tests/composables/useMembership.test.ts
import { describe, it, expect, vi } from 'vitest'

const mockCollection = vi.fn()
const mockOnSnapshot = vi.fn()
const mockHttpsCallable = vi.fn(() => vi.fn().mockResolvedValue({ data: { ok: true } }))

vi.mock('firebase/firestore', () => ({
  collection: (...a: unknown[]) => mockCollection(...a),
  onSnapshot: (...a: unknown[]) => mockOnSnapshot(...a),
}))
vi.mock('firebase/functions', () => ({
  httpsCallable: (...a: unknown[]) => mockHttpsCallable(...a),
}))
vi.mock('#imports', () => ({
  useFirebase: () => ({ db: {}, functions: {} }),
  useState: <T>(_k: string, init: () => T) => ({ value: init() }),
}))

describe('useMembership', () => {
  it('lists members and reacts to snapshots', async () => {
    let h: (s: { docs: { id: string; data: () => unknown }[] }) => void = () => {}
    mockOnSnapshot.mockImplementation((_ref, cb) => { h = cb; return () => {} })

    const { useMembership } = await import('../../layers/core/composables/useMembership')
    const { members, subscribe } = useMembership('lila')
    subscribe()
    h({ docs: [{ id: 'u1', data: () => ({ role: 'director', status: 'active' }) }] })
    expect(members.value).toEqual([{ id: 'u1', role: 'director', status: 'active' }])
  })

  it('invite delegates to setMembership callable', async () => {
    const { useMembership } = await import('../../layers/core/composables/useMembership')
    const { invite } = useMembership('lila')
    await invite({ email: 'sarah@example.com', role: 'booker' })
    expect(mockHttpsCallable).toHaveBeenCalledWith({}, 'setMembership')
  })
})
```

- [ ] **Step 6: Run to verify failure**

```bash
pnpm exec vitest run tests/composables/useMembership.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 7: Write `useMembership` composable**

```ts
// layers/core/composables/useMembership.ts
import { collection, onSnapshot } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import type { Membership, Role } from '../types'

type MemberRow = Membership & { id: string }

export const useMembership = (orgId: string) => {
  const { db, functions } = useFirebase()
  const members = useState<MemberRow[]>(`members:${orgId}`, () => [])

  const subscribe = () => {
    const ref = collection(db, 'organizations', orgId, 'memberships')
    return onSnapshot(ref, (snap) => {
      members.value = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Membership) }))
    })
  }

  const invite = (input: { email: string; role: Role }) =>
    httpsCallable(functions, 'setMembership')({ orgId, ...input })

  const revoke = (userId: string) =>
    httpsCallable(functions, 'revokeMembership')({ orgId, userId })

  return { members, subscribe, invite, revoke }
}
```

- [ ] **Step 8: Run all tests to verify**

```bash
pnpm exec vitest run tests/composables/
```
Expected: all passing.

- [ ] **Step 9: Commit**

```bash
git add layers/core/composables/ tests/composables/
git commit -m "feat(core): add useOrg and useMembership composables"
```

---

## Task 8: Add `useEvent` and `useLocation` composables + tests

**Files:**
- Create: `layers/core/composables/useEvent.ts`, `useLocation.ts`
- Create: `tests/composables/useEvent.test.ts`, `useLocation.test.ts`

- [ ] **Step 1: Write the failing test for `useEvent`**

```ts
// tests/composables/useEvent.test.ts
import { describe, it, expect, vi } from 'vitest'

const mockCollection = vi.fn()
const mockOnSnapshot = vi.fn()
const mockAddDoc = vi.fn().mockResolvedValue({ id: 'evt1' })
const mockDoc = vi.fn()
const mockUpdateDoc = vi.fn().mockResolvedValue(undefined)
const mockServerTimestamp = vi.fn(() => 'TS')

vi.mock('firebase/firestore', () => ({
  collection: (...a: unknown[]) => mockCollection(...a),
  onSnapshot: (...a: unknown[]) => mockOnSnapshot(...a),
  addDoc: (...a: unknown[]) => mockAddDoc(...a),
  doc: (...a: unknown[]) => mockDoc(...a),
  updateDoc: (...a: unknown[]) => mockUpdateDoc(...a),
  serverTimestamp: () => mockServerTimestamp(),
  query: (...a: unknown[]) => a,
  where: (...a: unknown[]) => a,
  Timestamp: { fromDate: (d: Date) => ({ d }) },
}))
vi.mock('#imports', () => ({
  useFirebase: () => ({ db: {} }),
  useState: <T>(_k: string, init: () => T) => ({ value: init() }),
}))

describe('useEvent', () => {
  it('createEvent calls addDoc with required fields', async () => {
    const { useEvent } = await import('../../layers/core/composables/useEvent')
    const { createEvent } = useEvent('lila')
    await createEvent({ name: 'lila 2025', slug: 'lila-2025', start: new Date('2025-09-04'), end: new Date('2025-09-06') })
    expect(mockAddDoc).toHaveBeenCalled()
    const payload = mockAddDoc.mock.calls[0][1]
    expect(payload).toMatchObject({
      name: 'lila 2025', slug: 'lila-2025', status: 'planning',
      publishToPublic: false, deletedAt: null, primaryLocale: 'en',
    })
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm exec vitest run tests/composables/useEvent.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write `useEvent` composable**

```ts
// layers/core/composables/useEvent.ts
import {
  collection, onSnapshot, addDoc, doc, updateDoc, query, where,
  serverTimestamp, Timestamp,
} from 'firebase/firestore'
import type { Event, EventStatus } from '../types'

type EventRow = Event & { id: string }

export const useEvent = (orgId: string) => {
  const { db } = useFirebase()
  const events = useState<EventRow[]>(`events:${orgId}`, () => [])

  const subscribe = () => {
    const ref = query(
      collection(db, 'organizations', orgId, 'events'),
      where('deletedAt', '==', null),
    )
    return onSnapshot(ref, (snap) => {
      events.value = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Event) }))
    })
  }

  const createEvent = (input: { name: string; slug: string; start: Date; end: Date }) => {
    const payload: Omit<Event, never> = {
      name: input.name,
      slug: input.slug,
      primaryLocale: 'en',
      primaryContacts: [],
      status: 'planning' as EventStatus,
      dates: { start: Timestamp.fromDate(input.start), end: Timestamp.fromDate(input.end) },
      publishToPublic: false,
      createdAt: serverTimestamp() as never,
      deletedAt: null,
    }
    return addDoc(collection(db, 'organizations', orgId, 'events'), payload)
  }

  const updateEvent = (eventId: string, patch: Partial<Event>) =>
    updateDoc(doc(db, 'organizations', orgId, 'events', eventId), patch)

  const softDelete = (eventId: string) =>
    updateDoc(doc(db, 'organizations', orgId, 'events', eventId), { deletedAt: serverTimestamp() })

  return { events, subscribe, createEvent, updateEvent, softDelete }
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
pnpm exec vitest run tests/composables/useEvent.test.ts
```
Expected: 1 passed.

- [ ] **Step 5: Write the failing test for `useLocation`**

```ts
// tests/composables/useLocation.test.ts
import { describe, it, expect, vi } from 'vitest'

const mockCollection = vi.fn()
const mockOnSnapshot = vi.fn()
const mockAddDoc = vi.fn().mockResolvedValue({ id: 'loc1' })
const mockDoc = vi.fn()
const mockUpdateDoc = vi.fn().mockResolvedValue(undefined)
const mockDeleteDoc = vi.fn().mockResolvedValue(undefined)

vi.mock('firebase/firestore', () => ({
  collection: (...a: unknown[]) => mockCollection(...a),
  onSnapshot: (...a: unknown[]) => mockOnSnapshot(...a),
  addDoc: (...a: unknown[]) => mockAddDoc(...a),
  doc: (...a: unknown[]) => mockDoc(...a),
  updateDoc: (...a: unknown[]) => mockUpdateDoc(...a),
  deleteDoc: (...a: unknown[]) => mockDeleteDoc(...a),
  query: (...a: unknown[]) => a,
  orderBy: (...a: unknown[]) => a,
}))
vi.mock('#imports', () => ({
  useFirebase: () => ({ db: {} }),
  useState: <T>(_k: string, init: () => T) => ({ value: init() }),
}))

describe('useLocation', () => {
  it('createLocation adds with order field', async () => {
    const { useLocation } = await import('../../layers/core/composables/useLocation')
    const { createLocation } = useLocation('lila', 'evt1')
    await createLocation({ name: 'Aktionshalle', order: 0 })
    expect(mockAddDoc).toHaveBeenCalled()
    expect(mockAddDoc.mock.calls[0][1]).toMatchObject({ name: 'Aktionshalle', order: 0 })
  })

  it('removeLocation deletes the doc', async () => {
    const { useLocation } = await import('../../layers/core/composables/useLocation')
    const { removeLocation } = useLocation('lila', 'evt1')
    await removeLocation('loc1')
    expect(mockDeleteDoc).toHaveBeenCalled()
  })
})
```

- [ ] **Step 6: Run to verify failure**

```bash
pnpm exec vitest run tests/composables/useLocation.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 7: Write `useLocation` composable**

```ts
// layers/core/composables/useLocation.ts
import { collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc, query, orderBy } from 'firebase/firestore'
import type { Location } from '../types'

type LocationRow = Location & { id: string }

export const useLocation = (orgId: string, eventId: string) => {
  const { db } = useFirebase()
  const locations = useState<LocationRow[]>(`locations:${orgId}:${eventId}`, () => [])

  const subscribe = () => {
    const ref = query(
      collection(db, 'organizations', orgId, 'events', eventId, 'locations'),
      orderBy('order', 'asc'),
    )
    return onSnapshot(ref, (snap) => {
      locations.value = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Location) }))
    })
  }

  const createLocation = (input: Location) =>
    addDoc(collection(db, 'organizations', orgId, 'events', eventId, 'locations'), input)

  const updateLocation = (id: string, patch: Partial<Location>) =>
    updateDoc(doc(db, 'organizations', orgId, 'events', eventId, 'locations', id), patch)

  const removeLocation = (id: string) =>
    deleteDoc(doc(db, 'organizations', orgId, 'events', eventId, 'locations', id))

  return { locations, subscribe, createLocation, updateLocation, removeLocation }
}
```

- [ ] **Step 8: Run all tests**

```bash
pnpm exec vitest run
```
Expected: all passing.

- [ ] **Step 9: Commit**

```bash
git add layers/core/composables/ tests/composables/
git commit -m "feat(core): add useEvent and useLocation composables"
```

---

## Task 9: Set up `functions/` project (TypeScript + vitest)

**Files:**
- Create: `functions/package.json`, `tsconfig.json`, `vitest.config.ts`
- Create: `functions/src/index.ts`, `functions/src/core/helpers.ts`
- Create: `functions/src/test/setup.ts`

- [ ] **Step 1: Init the sub-package**

```bash
mkdir -p functions/src/core functions/src/test
cd functions
pnpm init
```

- [ ] **Step 2: Replace generated `functions/package.json`**

```json
{
  "name": "functions",
  "private": true,
  "main": "lib/index.js",
  "engines": { "node": "20" },
  "scripts": {
    "build": "tsc",
    "watch": "tsc -w",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "firebase-admin": "^12.0.0",
    "firebase-functions": "^5.0.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vitest": "^1.5.0"
  }
}
```

- [ ] **Step 3: Install**

```bash
pnpm install
cd ..
```

- [ ] **Step 4: Write `functions/tsconfig.json`**

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "moduleResolution": "node",
    "target": "es2022",
    "lib": ["es2022"],
    "strict": true,
    "esModuleInterop": true,
    "outDir": "lib",
    "sourceMap": true,
    "declaration": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"],
  "exclude": ["src/test/**"]
}
```

- [ ] **Step 5: Write `functions/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { setupFiles: ['./src/test/setup.ts'], environment: 'node' },
})
```

- [ ] **Step 6: Write `functions/src/test/setup.ts` to point Admin SDK at emulators**

```ts
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099'
process.env.GCLOUD_PROJECT = 'festivalmgr-dev'
```

- [ ] **Step 7: Write `functions/src/core/helpers.ts`**

```ts
import * as admin from 'firebase-admin'

if (admin.apps.length === 0) admin.initializeApp({ projectId: 'festivalmgr-dev' })

export const db = () => admin.firestore()
export const auth = () => admin.auth()

export const requireDirector = (
  ctxAuth: { uid?: string; token?: { orgId?: string; role?: string } } | undefined,
  orgId: string,
) => {
  if (!ctxAuth?.uid) throw new Error('unauthenticated')
  if (ctxAuth.token?.orgId !== orgId) throw new Error('cross-tenant')
  if (ctxAuth.token?.role !== 'director') throw new Error('not-a-director')
}
```

- [ ] **Step 8: Write `functions/src/index.ts` (placeholder; populated by next tasks)**

```ts
// re-exports populated by setMembership / revokeMembership / onUserCreated
export {} from './core/helpers'
```

- [ ] **Step 9: Verify build compiles**

```bash
pnpm --filter functions build
```
Expected: `lib/` directory created without errors.

- [ ] **Step 10: Commit**

```bash
git add functions/
git commit -m "chore(functions): scaffold typescript functions project"
```

---

## Task 10: Implement `setMembership` callable Function (TDD)

**Files:**
- Create: `functions/src/core/setMembership.ts`, `functions/src/test/setMembership.test.ts`
- Modify: `functions/src/index.ts`

- [ ] **Step 1: Write the failing test (run against the emulator)**

```ts
// functions/src/test/setMembership.test.ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import * as admin from 'firebase-admin'
import { setMembership } from '../core/setMembership'

const ORG = 'lila'
const DIRECTOR_UID = 'dir1'

beforeAll(async () => {
  await admin.firestore().collection('organizations').doc(ORG).set({
    name: 'lila e.V.', slug: ORG, defaultLocale: 'en', defaultCurrency: 'CHF',
    enabledModules: ['artists'], createdAt: admin.firestore.FieldValue.serverTimestamp(),
  })
})

beforeEach(async () => {
  // Wipe memberships between tests
  const memberships = await admin.firestore().collection(`organizations/${ORG}/memberships`).get()
  await Promise.all(memberships.docs.map((d) => d.ref.delete()))
})

describe('setMembership', () => {
  it('creates pending membership and a User stub for a new email', async () => {
    const result = await setMembership.run({
      data: { orgId: ORG, email: 'sarah@example.com', role: 'booker' },
      auth: { uid: DIRECTOR_UID, token: { orgId: ORG, role: 'director' } },
    } as never)

    expect(result.userId).toBeTruthy()
    const memberSnap = await admin.firestore().doc(`organizations/${ORG}/memberships/${result.userId}`).get()
    expect(memberSnap.data()).toMatchObject({ role: 'booker', status: 'pending' })

    const userSnap = await admin.firestore().doc(`users/${result.userId}`).get()
    expect(userSnap.data()).toMatchObject({ email: 'sarah@example.com', orgIds: [] })
  })

  it('rejects non-director callers', async () => {
    await expect(setMembership.run({
      data: { orgId: ORG, email: 'a@b.com', role: 'booker' },
      auth: { uid: 'someone', token: { orgId: ORG, role: 'crew' } },
    } as never)).rejects.toThrow(/director/i)
  })

  it('rejects cross-tenant calls', async () => {
    await expect(setMembership.run({
      data: { orgId: 'other-org', email: 'a@b.com', role: 'booker' },
      auth: { uid: DIRECTOR_UID, token: { orgId: ORG, role: 'director' } },
    } as never)).rejects.toThrow(/cross-tenant/)
  })
})
```

- [ ] **Step 2: Run to verify failure**

In one terminal: `firebase emulators:start --only auth,firestore --project festivalmgr-dev`
In another: `pnpm --filter functions test`

Expected: FAIL — `setMembership` not exported.

- [ ] **Step 3: Implement `setMembership`**

```ts
// functions/src/core/setMembership.ts
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import * as admin from 'firebase-admin'
import { db, requireDirector } from './helpers'

type Role = 'director' | 'booker' | 'production' | 'finance' | 'pr' | 'crew'

export const setMembership = onCall<{ orgId: string; email: string; role: Role }>(async (req) => {
  const { orgId, email, role } = req.data
  requireDirector(req.auth, orgId)

  // Find or create the user record. We do not create the Auth account here; the
  // onUserCreated trigger handles claim assignment when the invitee first signs in.
  const usersRef = db().collection('users')
  let userDoc = await usersRef.where('email', '==', email).limit(1).get()
  let userId: string

  if (userDoc.empty) {
    userId = usersRef.doc().id
    await usersRef.doc(userId).set({
      email,
      displayName: email.split('@')[0],
      orgIds: [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    })
  } else {
    userId = userDoc.docs[0].id
  }

  await db().doc(`organizations/${orgId}/memberships/${userId}`).set({
    userId,
    role,
    invitedBy: req.auth!.uid,
    invitedAt: admin.firestore.FieldValue.serverTimestamp(),
    status: 'pending',
  })

  // Sending the magic-link email is intentionally deferred to the auth UX
  // (the invitee initiates sign-in themselves). The membership exists and is
  // matched to their email when they first log in (handled by onUserCreated).
  return { userId }
})
```

- [ ] **Step 4: Re-export from `functions/src/index.ts`**

```ts
export { setMembership } from './core/setMembership'
```

- [ ] **Step 5: Run tests to verify pass**

```bash
pnpm --filter functions test
```
Expected: 3 passed.

- [ ] **Step 6: Commit**

```bash
git add functions/src/core/setMembership.ts functions/src/test/setMembership.test.ts functions/src/index.ts
git commit -m "feat(functions): add setMembership callable"
```

---

## Task 11: Implement `revokeMembership` callable (TDD)

**Files:**
- Create: `functions/src/core/revokeMembership.ts`, `functions/src/test/revokeMembership.test.ts`
- Modify: `functions/src/index.ts`

- [ ] **Step 1: Write the failing test**

```ts
// functions/src/test/revokeMembership.test.ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import * as admin from 'firebase-admin'
import { revokeMembership } from '../core/revokeMembership'

const ORG = 'lila'
const DIRECTOR_UID = 'dir1'

beforeAll(async () => {
  await admin.firestore().collection('organizations').doc(ORG).set({
    name: 'lila e.V.', slug: ORG, defaultLocale: 'en', defaultCurrency: 'CHF',
    enabledModules: ['artists'], createdAt: admin.firestore.FieldValue.serverTimestamp(),
  })
})

beforeEach(async () => {
  await admin.firestore().doc(`users/u-target`).set({
    email: 't@example.com', displayName: 't', orgIds: [ORG],
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  })
  await admin.firestore().doc(`organizations/${ORG}/memberships/u-target`).set({
    userId: 'u-target', role: 'booker', status: 'active',
    invitedBy: DIRECTOR_UID, invitedAt: admin.firestore.FieldValue.serverTimestamp(),
  })
  try { await admin.auth().createUser({ uid: 'u-target', email: 't@example.com' }) } catch {}
  await admin.auth().setCustomUserClaims('u-target', { orgId: ORG, role: 'booker' })
})

describe('revokeMembership', () => {
  it('marks revoked, clears claim, removes orgId from User.orgIds', async () => {
    await revokeMembership.run({
      data: { orgId: ORG, userId: 'u-target' },
      auth: { uid: DIRECTOR_UID, token: { orgId: ORG, role: 'director' } },
    } as never)

    const m = await admin.firestore().doc(`organizations/${ORG}/memberships/u-target`).get()
    expect(m.data()?.status).toBe('revoked')

    const u = await admin.firestore().doc('users/u-target').get()
    expect(u.data()?.orgIds).toEqual([])

    const authUser = await admin.auth().getUser('u-target')
    expect(authUser.customClaims?.orgId).toBeUndefined()
  })

  it('rejects non-directors', async () => {
    await expect(revokeMembership.run({
      data: { orgId: ORG, userId: 'u-target' },
      auth: { uid: 'x', token: { orgId: ORG, role: 'booker' } },
    } as never)).rejects.toThrow(/director/i)
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm --filter functions test
```
Expected: FAIL — `revokeMembership` not found.

- [ ] **Step 3: Implement `revokeMembership`**

```ts
// functions/src/core/revokeMembership.ts
import { onCall } from 'firebase-functions/v2/https'
import * as admin from 'firebase-admin'
import { db, auth, requireDirector } from './helpers'

export const revokeMembership = onCall<{ orgId: string; userId: string }>(async (req) => {
  const { orgId, userId } = req.data
  requireDirector(req.auth, orgId)

  await db().doc(`organizations/${orgId}/memberships/${userId}`).update({ status: 'revoked' })

  // Best-effort: user may not have an Auth account yet (was invited but never signed in).
  try {
    const u = await auth().getUser(userId)
    const claims = { ...(u.customClaims ?? {}) } as Record<string, unknown>
    if (claims.orgId === orgId) {
      delete claims.orgId
      delete claims.role
    }
    await auth().setCustomUserClaims(userId, claims)
  } catch (e: unknown) {
    if ((e as { code?: string }).code !== 'auth/user-not-found') throw e
  }

  await db().doc(`users/${userId}`).update({
    orgIds: admin.firestore.FieldValue.arrayRemove(orgId),
  })

  return { ok: true }
})
```

- [ ] **Step 4: Add to `functions/src/index.ts`**

```ts
export { setMembership } from './core/setMembership'
export { revokeMembership } from './core/revokeMembership'
```

- [ ] **Step 5: Run tests to verify pass**

```bash
pnpm --filter functions test
```
Expected: all passing.

- [ ] **Step 6: Commit**

```bash
git add functions/src/core/revokeMembership.ts functions/src/test/revokeMembership.test.ts functions/src/index.ts
git commit -m "feat(functions): add revokeMembership callable"
```

---

## Task 12: Implement `onUserCreated` auth trigger (TDD)

**Files:**
- Create: `functions/src/core/onUserCreated.ts`, `functions/src/test/onUserCreated.test.ts`
- Modify: `functions/src/index.ts`

This trigger fires when a user is first created in Firebase Auth. It looks for any pending membership keyed by their email, sets the custom claim, flips the membership to active, and adds the orgId to `User.orgIds`. This is what makes the magic-link invite flow complete.

- [ ] **Step 1: Write the failing test**

```ts
// functions/src/test/onUserCreated.test.ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import * as admin from 'firebase-admin'
import { onUserCreatedHandler } from '../core/onUserCreated'

const ORG = 'lila'

beforeAll(async () => {
  await admin.firestore().doc(`organizations/${ORG}`).set({
    name: 'lila e.V.', slug: ORG, defaultLocale: 'en', defaultCurrency: 'CHF',
    enabledModules: ['artists'], createdAt: admin.firestore.FieldValue.serverTimestamp(),
  })
})

beforeEach(async () => {
  // Reset
  for (const path of [`organizations/${ORG}/memberships`]) {
    const docs = await admin.firestore().collection(path).get()
    await Promise.all(docs.docs.map((d) => d.ref.delete()))
  }
})

describe('onUserCreatedHandler', () => {
  it('activates pending memberships matching the email and sets claim', async () => {
    // Director already invited sarah@example.com (creating a pending membership keyed
    // by a userId we generate here)
    const userId = 'u-sarah'
    await admin.firestore().doc(`users/${userId}`).set({
      email: 'sarah@example.com', displayName: 'sarah', orgIds: [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    })
    await admin.firestore().doc(`organizations/${ORG}/memberships/${userId}`).set({
      userId, role: 'booker', status: 'pending',
      invitedBy: 'dir', invitedAt: admin.firestore.FieldValue.serverTimestamp(),
    })

    // Now sarah signs up via magic link — Firebase creates a *new* auth user
    // with a different uid. Simulate it.
    const newAuthUid = 'auth-uid-xyz'
    try { await admin.auth().createUser({ uid: newAuthUid, email: 'sarah@example.com' }) } catch {}

    await onUserCreatedHandler({ uid: newAuthUid, email: 'sarah@example.com' })

    // Membership migrated: keyed by the new auth uid, status active
    const newMember = await admin.firestore().doc(`organizations/${ORG}/memberships/${newAuthUid}`).get()
    expect(newMember.data()?.status).toBe('active')
    expect(newMember.data()?.role).toBe('booker')

    // Old placeholder membership cleaned up
    const oldMember = await admin.firestore().doc(`organizations/${ORG}/memberships/${userId}`).get()
    expect(oldMember.exists).toBe(false)

    // Claim set
    const u = await admin.auth().getUser(newAuthUid)
    expect(u.customClaims).toMatchObject({ orgId: ORG, role: 'booker' })

    // User profile migrated
    const newUser = await admin.firestore().doc(`users/${newAuthUid}`).get()
    expect(newUser.data()?.orgIds).toContain(ORG)
  })

  it('is a no-op when no pending membership matches the email', async () => {
    const uid = 'random-uid'
    try { await admin.auth().createUser({ uid, email: 'unknown@example.com' }) } catch {}
    await onUserCreatedHandler({ uid, email: 'unknown@example.com' })
    const u = await admin.auth().getUser(uid)
    expect(u.customClaims?.orgId).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm --filter functions test
```
Expected: FAIL — handler not exported.

- [ ] **Step 3: Implement the trigger**

```ts
// functions/src/core/onUserCreated.ts
import { beforeUserCreated } from 'firebase-functions/v2/identity'
import * as admin from 'firebase-admin'
import { db, auth } from './helpers'

// Pure handler so we can unit-test without spinning up the runtime wrapper.
export async function onUserCreatedHandler(input: { uid: string; email: string | null | undefined }) {
  const email = (input.email ?? '').toLowerCase()
  if (!email) return

  // Find any pending memberships keyed by a user doc whose email matches.
  const userQuery = await db().collection('users').where('email', '==', email).get()

  for (const oldUserDoc of userQuery.docs) {
    if (oldUserDoc.id === input.uid) continue // already keyed correctly

    const oldData = oldUserDoc.data()
    // Migrate user doc to the new uid keying
    await db().doc(`users/${input.uid}`).set({
      ...oldData,
      orgIds: oldData.orgIds ?? [],
    }, { merge: true })

    // For every org in oldData.orgIds AND every pending membership, migrate.
    const memberships = await db()
      .collectionGroup('memberships')
      .where('userId', '==', oldUserDoc.id)
      .get()

    for (const m of memberships.docs) {
      const orgId = m.ref.parent.parent!.id
      const data = m.data()
      const newRef = db().doc(`organizations/${orgId}/memberships/${input.uid}`)
      await newRef.set({
        ...data,
        userId: input.uid,
        status: 'active',
        acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
      })
      await m.ref.delete()

      // Set claim (single-org for v1; latest invite wins on conflict)
      await auth().setCustomUserClaims(input.uid, { orgId, role: data.role })

      await db().doc(`users/${input.uid}`).update({
        orgIds: admin.firestore.FieldValue.arrayUnion(orgId),
      })
    }

    // Clean up placeholder user doc
    if (oldUserDoc.id !== input.uid) await oldUserDoc.ref.delete()
  }
}

export const onUserCreated = beforeUserCreated(async (event) => {
  await onUserCreatedHandler({ uid: event.data.uid, email: event.data.email })
})
```

> **Note on `beforeUserCreated`:** Firebase Auth blocking functions require the Blaze plan. In the dev emulator they work without a plan. Plan C addresses production billing.

- [ ] **Step 4: Add to `functions/src/index.ts`**

```ts
export { setMembership } from './core/setMembership'
export { revokeMembership } from './core/revokeMembership'
export { onUserCreated } from './core/onUserCreated'
```

- [ ] **Step 5: Run all functions tests**

```bash
pnpm --filter functions test
```
Expected: all passing.

- [ ] **Step 6: Commit**

```bash
git add functions/src/core/onUserCreated.ts functions/src/test/onUserCreated.test.ts functions/src/index.ts
git commit -m "feat(functions): add onUserCreated auth trigger for claim sync"
```

---

## Task 13: Add `seed-director` script

**Files:**
- Create: `scripts/seed-director.ts`, `scripts/tsconfig.json`
- Modify: `package.json`

The seed script creates the bootstrap org (`lila`), a director user (`dario`), and one pending membership for that director, then sets the claim. Idempotent — safe to re-run after wiping the emulator.

- [ ] **Step 1: Install tsx for running TS scripts**

```bash
pnpm add -D tsx
```

- [ ] **Step 2: Write `scripts/seed-director.ts`**

```ts
// scripts/seed-director.ts
import * as admin from 'firebase-admin'

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080'
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099'
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT ?? 'festivalmgr-dev'

admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT })

const ORG = process.env.SEED_ORG_SLUG ?? 'lila'
const DIRECTOR_EMAIL = process.env.SEED_DIRECTOR_EMAIL ?? 'dario@example.com'
const DIRECTOR_UID = process.env.SEED_DIRECTOR_UID ?? 'dario'

async function main() {
  await admin.firestore().doc(`organizations/${ORG}`).set({
    name: 'lila. queer festival e.V.',
    slug: ORG,
    defaultLocale: 'en',
    defaultCurrency: 'CHF',
    enabledModules: ['artists', 'budget', 'booking', 'riders', 'schedule'],
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true })

  // Create the auth user with a temporary "magic-link will overwrite" email.
  try { await admin.auth().getUser(DIRECTOR_UID) } catch {
    await admin.auth().createUser({ uid: DIRECTOR_UID, email: DIRECTOR_EMAIL })
  }
  await admin.auth().setCustomUserClaims(DIRECTOR_UID, { orgId: ORG, role: 'director' })

  await admin.firestore().doc(`users/${DIRECTOR_UID}`).set({
    email: DIRECTOR_EMAIL,
    displayName: 'Dario',
    orgIds: [ORG],
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true })

  await admin.firestore().doc(`organizations/${ORG}/memberships/${DIRECTOR_UID}`).set({
    userId: DIRECTOR_UID,
    role: 'director',
    invitedBy: DIRECTOR_UID,
    invitedAt: admin.firestore.FieldValue.serverTimestamp(),
    acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
    status: 'active',
  }, { merge: true })

  console.log(`✓ seeded org=${ORG}, director uid=${DIRECTOR_UID}, email=${DIRECTOR_EMAIL}`)
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })
```

- [ ] **Step 3: Add npm script to root `package.json`**

Modify `package.json` `scripts` block:

```json
"scripts": {
  "build": "nuxt build",
  "dev": "FIREBASE_USE_EMULATOR=1 concurrently \"firebase emulators:start --project festivalmgr-dev --only auth,firestore,functions,storage\" \"nuxt dev\"",
  "dev:seed": "tsx scripts/seed-director.ts",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 4: Add `concurrently` for the dev script**

```bash
pnpm add -D concurrently
```

- [ ] **Step 5: Verify the seed runs against an emulator**

In one terminal: `firebase emulators:start --only auth,firestore --project festivalmgr-dev`
In another: `pnpm dev:seed`

Expected: prints `✓ seeded org=lila, director uid=dario, email=dario@example.com`. Confirm in the Firebase Emulator UI at `http://127.0.0.1:4000`:
- An `organizations/lila` doc exists.
- A `users/dario` doc exists with `orgIds: ['lila']`.
- A membership doc exists at `organizations/lila/memberships/dario` with status `active`.
- An auth user `dario` with custom claims `{ orgId: "lila", role: "director" }`.

- [ ] **Step 6: Commit**

```bash
git add scripts/ package.json pnpm-lock.yaml
git commit -m "feat(scripts): add seed-director bootstrap script"
```

---

## Task 14: Build login page (magic-link + Google)

**Files:**
- Create: `layers/core/pages/login.vue`, `layers/core/pages/auth/complete.vue`

- [ ] **Step 1: Write the login page**

```vue
<!-- layers/core/pages/login.vue -->
<script setup lang="ts">
import {
  GoogleAuthProvider, sendSignInLinkToEmail, signInWithPopup,
} from 'firebase/auth'

definePageMeta({ layout: false, public: true })

const { auth } = useFirebase()
const { t } = useI18n()
const email = ref('')
const sentToEmail = ref<string | null>(null)
const error = ref<string | null>(null)
const busy = ref(false)

async function sendLink() {
  error.value = null
  busy.value = true
  try {
    const url = `${location.origin}/auth/complete`
    await sendSignInLinkToEmail(auth, email.value, { url, handleCodeInApp: true })
    window.localStorage.setItem('emailForSignIn', email.value)
    sentToEmail.value = email.value
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}

async function withGoogle() {
  error.value = null
  busy.value = true
  try {
    await signInWithPopup(auth, new GoogleAuthProvider())
    await navigateTo('/')
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center p-6">
    <UCard class="w-full max-w-md">
      <template #header>
        <h1 class="text-xl font-semibold">{{ t('auth.loginTitle') }}</h1>
      </template>

      <UAlert v-if="error" color="error" :description="error" class="mb-4" />
      <UAlert v-if="sentToEmail" color="success" :description="t('auth.magicLinkSent')" class="mb-4" />

      <form v-if="!sentToEmail" class="space-y-3" @submit.prevent="sendLink">
        <UFormField :label="t('auth.magicLinkLabel')">
          <UInput v-model="email" type="email" required autocomplete="email" class="w-full" />
        </UFormField>
        <UButton type="submit" block :loading="busy">{{ t('auth.magicLinkSubmit') }}</UButton>
      </form>

      <USeparator class="my-6" label="or" />

      <UButton block variant="outline" icon="i-simple-icons-google" :loading="busy" @click="withGoogle">
        {{ t('auth.googleSubmit') }}
      </UButton>
    </UCard>
  </div>
</template>
```

- [ ] **Step 2: Write the magic-link completion page**

```vue
<!-- layers/core/pages/auth/complete.vue -->
<script setup lang="ts">
import { isSignInWithEmailLink, signInWithEmailLink } from 'firebase/auth'

definePageMeta({ layout: false, public: true })

const { auth } = useFirebase()
const { t } = useI18n()
const error = ref<string | null>(null)

onMounted(async () => {
  if (!isSignInWithEmailLink(auth, window.location.href)) {
    error.value = 'Invalid sign-in link.'
    return
  }
  let email = window.localStorage.getItem('emailForSignIn')
  if (!email) email = window.prompt('Confirm your email to complete sign-in') ?? null
  if (!email) { error.value = 'Email required.'; return }
  try {
    await signInWithEmailLink(auth, email, window.location.href)
    window.localStorage.removeItem('emailForSignIn')
    // Force a token refresh so any custom claims set by onUserCreated land in the ID token.
    await auth.currentUser?.getIdToken(true)
    await navigateTo('/')
  } catch (e) {
    error.value = (e as Error).message
  }
})
</script>

<template>
  <div class="min-h-screen flex items-center justify-center p-6">
    <UCard>
      <p v-if="!error">{{ t('auth.completing') }}</p>
      <UAlert v-else color="error" :description="error" />
    </UCard>
  </div>
</template>
```

- [ ] **Step 3: Verify pages compile**

```bash
pnpm exec nuxt prepare
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add layers/core/pages/login.vue layers/core/pages/auth/
git commit -m "feat(core): add magic-link and google login pages"
```

---

## Task 15: Add auth-guard middleware and dashboard redirect

**Files:**
- Create: `layers/core/middleware/auth.global.ts`, `layers/core/pages/index.vue`

- [ ] **Step 1: Write the global middleware**

```ts
// layers/core/middleware/auth.global.ts
export default defineNuxtRouteMiddleware((to) => {
  if (to.meta.public) return

  // Server-side renders skip auth — we're SPA mode anyway, but be defensive.
  if (import.meta.server) return

  const { user } = useUser()
  if (!user.value) return navigateTo('/login')
})
```

- [ ] **Step 2: Write a dashboard placeholder**

```vue
<!-- layers/core/pages/index.vue -->
<script setup lang="ts">
const { user, signOut } = useUser()
</script>

<template>
  <div class="min-h-screen p-8 max-w-3xl mx-auto">
    <header class="flex items-center justify-between mb-8">
      <h1 class="text-2xl font-semibold">festivalmgr</h1>
      <div class="flex items-center gap-3">
        <span class="text-sm text-default-500">{{ user?.email }}</span>
        <UButton size="sm" variant="ghost" @click="signOut">Sign out</UButton>
      </div>
    </header>

    <nav class="grid gap-3 sm:grid-cols-2">
      <UCard><NuxtLink to="/events"><h2 class="font-medium">Events</h2></NuxtLink></UCard>
      <UCard><NuxtLink to="/settings/members"><h2 class="font-medium">Members</h2></NuxtLink></UCard>
      <UCard><NuxtLink to="/settings"><h2 class="font-medium">Org settings</h2></NuxtLink></UCard>
    </nav>
  </div>
</template>
```

- [ ] **Step 3: Verify pages compile**

```bash
pnpm exec nuxt prepare
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add layers/core/middleware/ layers/core/pages/index.vue
git commit -m "feat(core): add auth middleware and dashboard"
```

---

## Task 16: Build org settings page

**Files:**
- Create: `layers/core/pages/settings/index.vue`

- [ ] **Step 1: Write the page**

```vue
<!-- layers/core/pages/settings/index.vue -->
<script setup lang="ts">
import { doc, updateDoc } from 'firebase/firestore'

const { user } = useUser()
const { t } = useI18n()
const { db } = useFirebase()

// In v1, the user belongs to exactly one org via custom claim.
const claimResult = await user.value?.getIdTokenResult()
const orgId = claimResult?.claims.orgId as string | undefined

if (!orgId) throw createError({ statusCode: 403, statusMessage: 'No org' })

const { org, subscribe } = useOrg(orgId)
let stop: (() => void) | undefined
onMounted(() => { stop = subscribe() })
onBeforeUnmount(() => stop?.())

const editName = ref('')
watchEffect(() => { if (org.value && !editName.value) editName.value = org.value.name })

async function save() {
  if (!org.value) return
  await updateDoc(doc(db, 'organizations', orgId!), { name: editName.value })
}
</script>

<template>
  <div class="min-h-screen p-8 max-w-2xl mx-auto">
    <h1 class="text-2xl font-semibold mb-6">{{ t('settings.orgTitle') }}</h1>

    <form v-if="org" class="space-y-4" @submit.prevent="save">
      <UFormField :label="t('settings.orgNameLabel')">
        <UInput v-model="editName" class="w-full" />
      </UFormField>
      <UButton type="submit">{{ t('settings.save') }}</UButton>
    </form>

    <p v-else>Loading…</p>
  </div>
</template>
```

- [ ] **Step 2: Verify compile**

```bash
pnpm exec nuxt prepare
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add layers/core/pages/settings/index.vue
git commit -m "feat(core): add org settings page"
```

---

## Task 17: Build member admin page (list, invite, revoke)

**Files:**
- Create: `layers/core/pages/settings/members.vue`, `layers/core/components/MemberRow.vue`

- [ ] **Step 1: Write `MemberRow.vue`**

```vue
<!-- layers/core/components/MemberRow.vue -->
<script setup lang="ts">
import type { Membership, Role } from '../types'

defineProps<{ member: Membership & { id: string }; canRevoke: boolean }>()
defineEmits<{ revoke: [id: string] }>()
</script>

<template>
  <li class="flex items-center justify-between py-3 border-b border-default-200">
    <div>
      <div class="font-medium">{{ member.userId }}</div>
      <div class="text-sm text-default-500">{{ member.role }} — {{ member.status }}</div>
    </div>
    <UButton
      v-if="canRevoke && member.status !== 'revoked'"
      size="sm" color="error" variant="ghost"
      @click="$emit('revoke', member.id)"
    >Revoke</UButton>
  </li>
</template>
```

- [ ] **Step 2: Write the members page**

```vue
<!-- layers/core/pages/settings/members.vue -->
<script setup lang="ts">
import type { Role } from '~/types'

const { user } = useUser()
const { t } = useI18n()
const claim = await user.value?.getIdTokenResult()
const orgId = claim?.claims.orgId as string | undefined
if (!orgId) throw createError({ statusCode: 403, statusMessage: 'No org' })
const isDirector = claim?.claims.role === 'director'

const { members, subscribe, invite, revoke } = useMembership(orgId)
let stop: (() => void) | undefined
onMounted(() => { stop = subscribe() })
onBeforeUnmount(() => stop?.())

const newEmail = ref('')
const newRole = ref<Role>('booker')
const error = ref<string | null>(null)
const busy = ref(false)

async function inviteMember() {
  error.value = null
  busy.value = true
  try {
    await invite({ email: newEmail.value, role: newRole.value })
    newEmail.value = ''
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}

const roleOptions: { value: Role; label: string }[] = [
  { value: 'director', label: 'Director' },
  { value: 'booker', label: 'Booker' },
  { value: 'production', label: 'Production' },
  { value: 'finance', label: 'Finance' },
  { value: 'pr', label: 'PR' },
  { value: 'crew', label: 'Crew' },
]
</script>

<template>
  <div class="min-h-screen p-8 max-w-3xl mx-auto">
    <h1 class="text-2xl font-semibold mb-6">{{ t('members.title') }}</h1>

    <section v-if="isDirector" class="mb-8">
      <h2 class="font-medium mb-3">{{ t('members.inviteHeading') }}</h2>
      <UAlert v-if="error" color="error" :description="error" class="mb-3" />
      <form class="flex gap-2 items-end" @submit.prevent="inviteMember">
        <UFormField :label="t('members.emailLabel')" class="flex-1">
          <UInput v-model="newEmail" type="email" required class="w-full" />
        </UFormField>
        <UFormField :label="t('members.roleLabel')">
          <USelect v-model="newRole" :items="roleOptions" />
        </UFormField>
        <UButton type="submit" :loading="busy">{{ t('members.inviteSubmit') }}</UButton>
      </form>
    </section>

    <ul>
      <MemberRow
        v-for="m in members" :key="m.id"
        :member="m"
        :can-revoke="!!isDirector"
        @revoke="revoke($event)"
      />
    </ul>
  </div>
</template>
```

- [ ] **Step 3: Verify compile**

```bash
pnpm exec nuxt prepare
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add layers/core/pages/settings/members.vue layers/core/components/MemberRow.vue
git commit -m "feat(core): add member admin page"
```

---

## Task 18: Build event list + create page

**Files:**
- Create: `layers/core/pages/events/index.vue`, `layers/core/components/EventCard.vue`

- [ ] **Step 1: Write `EventCard.vue`**

```vue
<!-- layers/core/components/EventCard.vue -->
<script setup lang="ts">
import type { Event } from '../types'
defineProps<{ event: Event & { id: string } }>()
</script>

<template>
  <UCard>
    <NuxtLink :to="`/events/${event.id}`">
      <h3 class="font-medium">{{ event.name }}</h3>
      <p class="text-sm text-default-500">
        {{ event.dates.start.toDate().toLocaleDateString() }} —
        {{ event.dates.end.toDate().toLocaleDateString() }}
      </p>
      <p class="text-xs text-default-400">{{ event.status }}</p>
    </NuxtLink>
  </UCard>
</template>
```

- [ ] **Step 2: Write the event list page**

```vue
<!-- layers/core/pages/events/index.vue -->
<script setup lang="ts">
const { user } = useUser()
const { t } = useI18n()
const claim = await user.value?.getIdTokenResult()
const orgId = claim?.claims.orgId as string | undefined
if (!orgId) throw createError({ statusCode: 403, statusMessage: 'No org' })

const { events, subscribe, createEvent } = useEvent(orgId)
let stop: (() => void) | undefined
onMounted(() => { stop = subscribe() })
onBeforeUnmount(() => stop?.())

const showCreate = ref(false)
const draft = reactive({ name: '', slug: '', start: '', end: '' })
const busy = ref(false)
const error = ref<string | null>(null)

async function submitCreate() {
  error.value = null
  busy.value = true
  try {
    await createEvent({
      name: draft.name,
      slug: draft.slug,
      start: new Date(draft.start),
      end: new Date(draft.end),
    })
    showCreate.value = false
    Object.assign(draft, { name: '', slug: '', start: '', end: '' })
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="min-h-screen p-8 max-w-4xl mx-auto">
    <header class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-semibold">{{ t('events.title') }}</h1>
      <UButton @click="showCreate = true">{{ t('events.createButton') }}</UButton>
    </header>

    <UModal v-model:open="showCreate">
      <template #content>
        <UCard>
          <UAlert v-if="error" color="error" :description="error" class="mb-3" />
          <form class="space-y-3" @submit.prevent="submitCreate">
            <UFormField :label="t('events.nameLabel')">
              <UInput v-model="draft.name" required class="w-full" />
            </UFormField>
            <UFormField :label="t('events.slugLabel')">
              <UInput v-model="draft.slug" required pattern="[a-z0-9-]+" class="w-full" />
            </UFormField>
            <UFormField :label="t('events.startLabel')">
              <UInput v-model="draft.start" type="date" required class="w-full" />
            </UFormField>
            <UFormField :label="t('events.endLabel')">
              <UInput v-model="draft.end" type="date" required class="w-full" />
            </UFormField>
            <UButton type="submit" :loading="busy">{{ t('events.save') }}</UButton>
          </form>
        </UCard>
      </template>
    </UModal>

    <div class="grid gap-3 sm:grid-cols-2">
      <EventCard v-for="e in events" :key="e.id" :event="e" />
    </div>
  </div>
</template>
```

- [ ] **Step 3: Verify compile**

```bash
pnpm exec nuxt prepare
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add layers/core/pages/events/index.vue layers/core/components/EventCard.vue
git commit -m "feat(core): add event list and create page"
```

---

## Task 19: Build event detail page with location CRUD

**Files:**
- Create: `layers/core/pages/events/[id].vue`, `layers/core/components/LocationListItem.vue`

- [ ] **Step 1: Write `LocationListItem.vue`**

```vue
<!-- layers/core/components/LocationListItem.vue -->
<script setup lang="ts">
import type { Location } from '../types'
defineProps<{ location: Location & { id: string } }>()
defineEmits<{ remove: [id: string] }>()
</script>

<template>
  <li class="flex items-center justify-between py-3 border-b border-default-200">
    <div>
      <div class="font-medium">{{ location.name }}</div>
      <div v-if="location.capacity" class="text-sm text-default-500">cap. {{ location.capacity }}</div>
    </div>
    <UButton size="sm" color="error" variant="ghost" @click="$emit('remove', location.id)">Delete</UButton>
  </li>
</template>
```

- [ ] **Step 2: Write the event detail page**

```vue
<!-- layers/core/pages/events/[id].vue -->
<script setup lang="ts">
const route = useRoute()
const { user } = useUser()
const { t } = useI18n()
const claim = await user.value?.getIdTokenResult()
const orgId = claim?.claims.orgId as string | undefined
if (!orgId) throw createError({ statusCode: 403, statusMessage: 'No org' })

const eventId = route.params.id as string
const { events, subscribe: subEvents } = useEvent(orgId)
const { locations, subscribe: subLocs, createLocation, removeLocation } = useLocation(orgId, eventId)

let stops: (() => void)[] = []
onMounted(() => { stops = [subEvents(), subLocs()] })
onBeforeUnmount(() => stops.forEach((s) => s()))

const event = computed(() => events.value.find((e) => e.id === eventId))

const newLoc = reactive({ name: '', capacity: '' })
const busy = ref(false)
async function addLocation() {
  busy.value = true
  try {
    await createLocation({
      name: newLoc.name,
      capacity: newLoc.capacity ? Number(newLoc.capacity) : undefined,
      order: locations.value.length,
    })
    newLoc.name = ''
    newLoc.capacity = ''
  } finally { busy.value = false }
}
</script>

<template>
  <div class="min-h-screen p-8 max-w-3xl mx-auto">
    <header v-if="event" class="mb-8">
      <h1 class="text-2xl font-semibold">{{ event.name }}</h1>
      <p class="text-default-500">
        {{ event.dates.start.toDate().toLocaleDateString() }} —
        {{ event.dates.end.toDate().toLocaleDateString() }}
      </p>
    </header>

    <section>
      <h2 class="text-lg font-medium mb-3">{{ t('locations.title') }}</h2>
      <form class="flex gap-2 items-end mb-6" @submit.prevent="addLocation">
        <UFormField :label="t('locations.nameLabel')" class="flex-1">
          <UInput v-model="newLoc.name" required class="w-full" />
        </UFormField>
        <UFormField :label="t('locations.capacityLabel')">
          <UInput v-model="newLoc.capacity" type="number" min="0" class="w-32" />
        </UFormField>
        <UButton type="submit" :loading="busy">{{ t('locations.save') }}</UButton>
      </form>

      <ul>
        <LocationListItem
          v-for="loc in locations" :key="loc.id"
          :location="loc"
          @remove="removeLocation($event)"
        />
      </ul>
    </section>
  </div>
</template>
```

- [ ] **Step 3: Verify compile**

```bash
pnpm exec nuxt prepare
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add layers/core/pages/events/\[id\].vue layers/core/components/LocationListItem.vue
git commit -m "feat(core): add event detail page with location crud"
```

---

## Task 20: Wire up final dev workflow scripts and verify end-to-end

**Files:**
- Modify: `package.json`
- Create: `README.md` (minimal getting-started)

- [ ] **Step 1: Confirm `package.json` `scripts` (already added in Task 13) match this**

```json
"scripts": {
  "build": "nuxt build",
  "dev": "FIREBASE_USE_EMULATOR=1 concurrently -k -n emu,nuxt -c blue,green \"firebase emulators:start --project festivalmgr-dev --only auth,firestore,functions,storage\" \"nuxt dev\"",
  "dev:seed": "tsx scripts/seed-director.ts",
  "test": "vitest run && pnpm --filter functions test",
  "test:watch": "vitest"
}
```

- [ ] **Step 2: Write a minimal `README.md`**

```md
# festivalmgr

Multi-tenant SaaS for festival organization. See `docs/superpowers/specs/2026-05-08-festivalmgr-platform-foundation-design.md` for the full design.

## Getting started

Prereqs: Node 20+, pnpm 9+, Firebase CLI.

```bash
pnpm install
cp .env.example .env
pnpm dev          # starts emulators + Nuxt dev server (also need Functions built)
pnpm --filter functions build && pnpm --filter functions watch  # in another terminal
pnpm dev:seed     # seeds the bootstrap director user
```

Open http://127.0.0.1:3000 — sign in with `dario@example.com`. The Firebase Emulator UI is at http://127.0.0.1:4000.

## Tests

```bash
pnpm test         # frontend composables + functions
```
```

- [ ] **Step 3: Run the full unit suite**

```bash
pnpm test
```
Expected: all tests pass (composables + functions, with the Firebase emulator running for the functions tests).

- [ ] **Step 4: Run full smoke test against emulators (manual verification)**

In one terminal: `pnpm --filter functions build && pnpm --filter functions watch`
In another terminal: `pnpm dev`
Wait for `Listening on http://127.0.0.1:3000` and the emulator UI banner. Then in a third terminal:
```bash
pnpm dev:seed
```

Manual verification checklist:
1. Open `http://127.0.0.1:3000/login`. Sign in with Google (use the emulator's "Add new account" prompt) → lands on dashboard.
2. Visit `/settings/members` — empty list at first (Google sign-in user is not a member of the org). Confirm UI works.
3. Sign out. Sign in via magic link as `dario@example.com` (the emulator UI displays the magic link in its "Auth" tab logs).
4. Confirm dashboard loads, shows email.
5. Visit `/settings` — change org name → save → reload → name persists.
6. Visit `/settings/members` — invite `sarah@example.com` as `booker`. The list updates to show a `pending` membership row.
7. Open the Auth emulator tab → use "Sign in with email link" for `sarah@example.com` → completes sign-in → dashboard renders for Sarah.
8. As Dario, revoke Sarah's membership → status flips to `revoked`. Sarah's claim is cleared (verify in emulator UI).
9. Visit `/events` → create new event "lila 2025" with dates → appears in list.
10. Open the event → add location "Aktionshalle" → it persists.

If any step fails, capture the error and fix it before committing this final task.

- [ ] **Step 5: Commit**

```bash
git add README.md package.json
git commit -m "chore: add README and finalize dev scripts"
```

---

## Self-review (already complete)

- Spec coverage: every Section-15-MVP item except items 4, 5, 7, 8 (Plan B / Plan C) is implemented in this plan. Items covered: 1 (repo scaffold) → Task 1–3, 9; 2 (core layer types + composables + login + member admin) → Tasks 4–8, 14–17; 3 (auth flow + claim sync + seed-director) → Tasks 5, 10–13; 6 (local dev workflow) → Tasks 13, 20.
- Permissive starter rules (`firestore.rules`, `storage.rules`) are explicitly temporary and replaced in Plan B.
- Type names consistent across tasks: `User.orgIds`, `Membership.status`, `Event.deletedAt`, `Location.order`, `Role` enum, `ModuleKey` union — all match the spec's Section 6 and are reused identically in functions/test/seed code.
- No `TBD`/`TODO`/`implement later` placeholders. Every step has the actual code or command needed.
