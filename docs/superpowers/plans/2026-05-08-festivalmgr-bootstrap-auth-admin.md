# festivalmgr — Bootstrap, Auth & Member Admin Implementation Plan (Plan A of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Nuxt 4 + Firebase repo skeleton, the `core` Nuxt layer with shared types and composables, the Cloud Functions for membership lifecycle, and the screens for login + org settings + member admin + events + locations — all running locally against the Firebase Emulator Suite.

**Architecture:** Modular monolith. Single Nuxt 4 + Nuxt UI v4 + Tailwind CSS v4 app with `core` as a Nuxt layer; single Firebase project (Firestore + Auth + Functions + Storage). Firebase wiring goes through **VueFire** (`nuxt-vuefire`): the frontend reads/writes Firestore directly via VueFire's SSR-safe composables; Cloud Functions handle only what requires server trust (membership writes + custom-claim sync). Permissive starter rules in this plan; the locked-down rule set + emulator rules tests come in Plan B.

**Tech Stack:** Nuxt 4, Nuxt UI v4, Tailwind CSS v4, VueFire (`nuxt-vuefire`), Firebase JS SDK 11+, Firebase Functions v2 (TS), Firebase Admin SDK, Firebase Emulator Suite, Vitest, `@nuxtjs/i18n`, pnpm.

**Reference spec:** [docs/superpowers/specs/2026-05-08-festivalmgr-platform-foundation-design.md](../specs/2026-05-08-festivalmgr-platform-foundation-design.md)

**Out of scope (deferred to Plan B / Plan C):**
- Layered `firestore.rules.frag` composition + emulator rules tests (Plan B).
- Staging / prod GitHub Actions, Netlify production config, daily Firestore backups (Plan C).
- The `Artists`, `Schedule`, `Booking`, `Riders`, `Budget` module layers — separate brainstorm/spec/plan cycles each.
- Public share-links and the public crowd-API mirror (deferred per spec §15).

This plan ships **permissive starter rules** (auth required only) used only against emulators and a hand-seeded staging project. Plan B replaces them with the per-collection role rules and the rules-test suite.

---

## File Structure (created in this plan)

```
festivalmgr/
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.json                            (single root tsconfig — Nuxt 4)
├── nuxt.config.ts                           (top-level — auto-loads ~~/layers/*)
├── .gitignore
├── .nvmrc
├── README.md
├── firebase.json                            (emulator + deploy targets)
├── .firebaserc                              (project aliases)
├── firestore.rules                          (permissive starter — auth required only)
├── firestore.indexes.json                   (empty array; populated as queries appear)
├── storage.rules                            (permissive starter — auth required only)
├── vitest.config.ts                         (root vitest for composable unit tests)
├── app/
│   ├── app.vue                              (wraps <UApp><NuxtPage /></UApp>)
│   └── assets/css/main.css                  (Tailwind v4 + Nuxt UI imports)
├── i18n/
│   └── locales/en.json
├── functions/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   └── src/
│       ├── index.ts                         (re-exports module functions)
│       ├── core/
│       │   ├── helpers.ts                   (assertCallerHasRole, etc.)
│       │   ├── setMembership.ts             (callable: director invites)
│       │   ├── revokeMembership.ts          (callable: director revokes)
│       │   └── claimMembership.ts           (callable: invitee activates pending invites)
│       └── test/
│           ├── setup.ts
│           ├── setMembership.test.ts
│           ├── revokeMembership.test.ts
│           └── claimMembership.test.ts
├── layers/
│   └── core/
│       ├── nuxt.config.ts                   (layer config — currently a stub)
│       ├── app/
│       │   ├── components/
│       │   │   ├── AppShell.vue
│       │   │   ├── MemberRow.vue
│       │   │   ├── EventCard.vue
│       │   │   └── LocationListItem.vue
│       │   ├── composables/
│       │   │   ├── useFunctions.ts          (typed wrapper over Firebase Functions client)
│       │   │   ├── useUserProfile.ts        (current user's /users/{uid} doc)
│       │   │   ├── useOrg.ts                (current org from claim)
│       │   │   ├── useMemberships.ts        (memberships for current org)
│       │   │   ├── useEvent.ts              (single event)
│       │   │   ├── useEvents.ts             (event list for current org)
│       │   │   └── useLocations.ts          (locations for an event)
│       │   ├── middleware/
│       │   │   └── auth.global.ts           (route guard — sign-in required)
│       │   ├── pages/
│       │   │   ├── index.vue                (dashboard placeholder)
│       │   │   ├── login.vue
│       │   │   ├── auth/complete.vue        (magic-link callback)
│       │   │   ├── settings/
│       │   │   │   ├── index.vue            (org settings)
│       │   │   │   └── members.vue          (member admin)
│       │   │   └── events/
│       │   │       ├── index.vue            (event list)
│       │   │       └── [eventId].vue        (event detail + locations)
│       │   └── plugins/
│       │       └── claim-membership.client.ts  (post-sign-in claim activation)
│       └── shared/
│           └── types/
│               ├── index.ts
│               ├── user.ts
│               ├── organization.ts
│               ├── membership.ts
│               ├── event.ts
│               └── location.ts
├── scripts/
│   ├── seed-director.ts                     (creates first org + director user)
│   └── seed-emulator.ts                     (resets emulator + reseeds for dev)
└── tests/
    └── composables/
        ├── useUserProfile.test.ts
        ├── useOrg.test.ts
        ├── useEvents.test.ts
        └── useLocations.test.ts
```

**Naming notes:**
- Composables that return a single doc are singular (`useEvent`, `useOrg`); list composables are plural (`useEvents`, `useLocations`).
- VueFire's primitives (`useFirestore`, `useDocument`, `useCollection`, `useCurrentUser`) are used directly inside our app composables; they are **not** re-wrapped 1:1.

---

## Task 1: Repository scaffold (workspace, tsconfig, gitignore)

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.json`, `.gitignore`, `.nvmrc`, `README.md`

- [ ] **Step 1: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - .
  - functions
```

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "festivalmgr",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "concurrently -k -n nuxt,emu \"nuxt dev\" \"firebase emulators:start --import=./.emulator-data --export-on-exit\"",
    "dev:seed": "tsx scripts/seed-emulator.ts",
    "build": "nuxt build",
    "preview": "nuxt preview",
    "typecheck": "nuxt typecheck && pnpm --filter ./functions typecheck",
    "lint": "eslint .",
    "test": "vitest run",
    "test:functions": "pnpm --filter ./functions test",
    "seed:director": "tsx scripts/seed-director.ts"
  },
  "devDependencies": {
    "@nuxt/eslint": "^1.0.0",
    "concurrently": "^9.0.0",
    "eslint": "^9.0.0",
    "tsx": "^4.20.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 3: Create root `tsconfig.json`**

Nuxt 4 generates per-context tsconfigs internally; the root file just extends Nuxt's.

```json
{
  "extends": "./.nuxt/tsconfig.json"
}
```

- [ ] **Step 4: Create `.gitignore`**

```gitignore
node_modules
.nuxt
.output
.data
dist
.env
.env.*
!.env.example
.DS_Store
.emulator-data/
firebase-debug.log
firestore-debug.log
storage-debug.log
ui-debug.log
service-account*.json
.netlify
coverage
```

- [ ] **Step 5: Create `.nvmrc`**

```
22
```

- [ ] **Step 6: Create stub `README.md`** (filled in Task 31)

```markdown
# festivalmgr

See `docs/superpowers/specs/2026-05-08-festivalmgr-platform-foundation-design.md` for the architecture.

Dev onboarding instructions land in this README at the end of Plan A.
```

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "chore: scaffold pnpm workspace + root tooling"
```

---

## Task 2: Nuxt 4 install + minimal app entry

**Files:**
- Modify: `package.json` (add nuxt + @nuxtjs/i18n deps)
- Create: `nuxt.config.ts`, `app/app.vue`, `i18n/locales/en.json`

- [ ] **Step 1: Install Nuxt 4 + i18n**

```bash
pnpm add -D nuxt@^4.0.0
pnpm add -D @nuxtjs/i18n
```

- [ ] **Step 2: Create root `nuxt.config.ts`**

Layers under `~~/layers/*` are auto-registered — no `extends:` needed.

```ts
export default defineNuxtConfig({
  compatibilityDate: '2026-01-01',
  devtools: { enabled: true },
  modules: [
    '@nuxtjs/i18n',
  ],
  css: ['~/assets/css/main.css'],
  i18n: {
    defaultLocale: 'en',
    locales: [
      { code: 'en', file: 'en.json' },
    ],
    strategy: 'no_prefix',
  },
})
```

- [ ] **Step 3: Create `app/app.vue`**

```vue
<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
```

- [ ] **Step 4: Stub `i18n/locales/en.json`**

```json
{
  "app": {
    "title": "festivalmgr"
  },
  "auth": {
    "loginTitle": "Sign in to festivalmgr",
    "magicLinkLabel": "Send sign-in link",
    "googleLabel": "Continue with Google",
    "emailPlaceholder": "you@example.com"
  },
  "nav": {
    "events": "Events",
    "members": "Members",
    "settings": "Settings",
    "signOut": "Sign out"
  }
}
```

- [ ] **Step 5: Run `pnpm nuxt prepare` to verify config compiles**

```bash
pnpm nuxt prepare
```

Expected: completes without error and creates `.nuxt/` directory.

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat: add Nuxt 4 baseline + i18n stub"
```

---

## Task 3: Nuxt UI v4 + Tailwind CSS v4

**Files:**
- Modify: `package.json`, `nuxt.config.ts`
- Create: `app/assets/css/main.css`

- [ ] **Step 1: Install Nuxt UI + Tailwind**

```bash
pnpm add @nuxt/ui tailwindcss
```

Note: Nuxt UI registers `@nuxt/icon`, `@nuxt/fonts`, and `@nuxtjs/color-mode` automatically — do not list them in `modules`.

- [ ] **Step 2: Update `nuxt.config.ts` modules**

```ts
modules: [
  '@nuxt/ui',
  '@nuxtjs/i18n',
],
```

- [ ] **Step 3: Create `app/assets/css/main.css`**

```css
@import "tailwindcss";
@import "@nuxt/ui";
```

- [ ] **Step 4: Verify the dev server boots**

```bash
pnpm nuxt prepare
pnpm nuxt dev
```

Expected: Nuxt dev server starts, the placeholder page renders without console errors. Stop the server.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat: wire Nuxt UI v4 + Tailwind CSS v4"
```

---

## Task 4: Firebase project config + emulator declaration

**Files:**
- Create: `firebase.json`, `.firebaserc`, `firestore.indexes.json`

- [ ] **Step 1: Install Firebase CLI as a dev dep**

```bash
pnpm add -D firebase-tools
```

- [ ] **Step 2: Create `.firebaserc`**

Project IDs are placeholders the developer customises before deploying. The `dev` alias is for emulator-only — never deployed to.

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

- [ ] **Step 3: Create `firebase.json`**

```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "storage": {
    "rules": "storage.rules"
  },
  "functions": [
    {
      "source": "functions",
      "codebase": "default",
      "ignore": ["node_modules", ".git", "*.log", "test"],
      "predeploy": ["pnpm --filter ./functions build"]
    }
  ],
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

- [ ] **Step 4: Create empty `firestore.indexes.json`**

```json
{
  "indexes": [],
  "fieldOverrides": []
}
```

- [ ] **Step 5: Verify emulator boots**

```bash
pnpm exec firebase emulators:start --project festivalmgr-dev --only auth,firestore,storage
```

Expected: emulator UI becomes available at http://127.0.0.1:4000. Stop it (Ctrl+C).

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat: add Firebase project config + emulator suite"
```

---

## Task 5: Permissive starter Firestore + Storage rules

**Files:**
- Create: `firestore.rules`, `storage.rules`

These are intentionally permissive: any signed-in user can read/write everything in the project. Plan B replaces them with the layered, role-aware rules and the rules-test suite. Until then, **do not deploy Plan A to staging or prod.**

- [ ] **Step 1: Create `firestore.rules`**

```javascript
// PERMISSIVE STARTER RULES — Plan A only.
// Plan B replaces this with the layered, role-aware rule set + emulator rules tests.
// DO NOT DEPLOY THIS FILE BEYOND THE LOCAL EMULATOR.

rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

- [ ] **Step 2: Create `storage.rules`**

```javascript
// PERMISSIVE STARTER RULES — Plan A only.
// Plan B replaces this with the layered, role-aware rule set + emulator rules tests.
// DO NOT DEPLOY THIS FILE BEYOND THE LOCAL EMULATOR.

rules_version = '2';

service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "feat: add permissive starter Firestore + Storage rules"
```

---

## Task 6: VueFire install + module config + emulator wiring

**Files:**
- Modify: `package.json`, `nuxt.config.ts`
- Create: `.env.example`

VueFire (`nuxt-vuefire`) handles client SDK init, SSR-safe composables, Auth integration, and emulator wiring.

- [ ] **Step 1: Install runtime deps**

```bash
pnpm add nuxt-vuefire firebase
pnpm add firebase-admin firebase-functions
```

`firebase-admin` and `firebase-functions` are needed by Functions, but listing them at the workspace root makes it easier to import types in any package; the Functions package re-declares them in its own `package.json` in Task 21.

- [ ] **Step 2: Add `nuxt-vuefire` to `nuxt.config.ts` modules**

```ts
modules: [
  '@nuxt/ui',
  '@nuxtjs/i18n',
  'nuxt-vuefire',
],
```

- [ ] **Step 3: Add `vuefire` config block to `nuxt.config.ts`**

```ts
vuefire: {
  config: {
    apiKey:            process.env.NUXT_PUBLIC_FIREBASE_API_KEY,
    authDomain:        process.env.NUXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId:         process.env.NUXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket:     process.env.NUXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NUXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId:             process.env.NUXT_PUBLIC_FIREBASE_APP_ID,
  },
  auth: { enabled: true },
  emulators: {
    enabled: process.env.FIREBASE_USE_EMULATOR === '1',
    auth:      { host: '127.0.0.1', port: 9099 },
    firestore: { host: '127.0.0.1', port: 8080 },
    functions: { host: '127.0.0.1', port: 5001 },
    storage:   { host: '127.0.0.1', port: 9199 },
  },
},
```

- [ ] **Step 4: Create `.env.example`**

```dotenv
# Set to 1 to point the client SDK at the local Firebase emulators.
FIREBASE_USE_EMULATOR=1

# Public client config — for emulator dev these can stay as the demo defaults.
NUXT_PUBLIC_FIREBASE_API_KEY=demo-api-key
NUXT_PUBLIC_FIREBASE_AUTH_DOMAIN=festivalmgr-dev.firebaseapp.com
NUXT_PUBLIC_FIREBASE_PROJECT_ID=festivalmgr-dev
NUXT_PUBLIC_FIREBASE_STORAGE_BUCKET=festivalmgr-dev.appspot.com
NUXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=000000000000
NUXT_PUBLIC_FIREBASE_APP_ID=1:000000000000:web:demoappid
```

- [ ] **Step 5: Copy `.env.example` to `.env` and run prepare**

```bash
cp .env.example .env
pnpm nuxt prepare
```

Expected: `.nuxt/` regenerates without errors and `nuxt-vuefire` types appear in `.nuxt/types/`.

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat: wire VueFire + emulator config"
```

---

## Task 7: `core` Nuxt layer skeleton

**Files:**
- Create: `layers/core/nuxt.config.ts`

Layer auto-registration means we don't add `extends:` to the root config — the `~~/layers/core/` directory is loaded automatically and accessible via `#layers/core`.

- [ ] **Step 1: Create `layers/core/nuxt.config.ts`**

```ts
export default defineNuxtConfig({
  // Layer-local overrides only. Modules are declared once at the project root.
})
```

The layer is intentionally near-empty for now; module-level config slots in here when later domain layers (Artists, Schedule, etc.) need module-specific component prefixes or per-layer i18n directories.

- [ ] **Step 2: Verify the layer is picked up**

```bash
pnpm nuxt prepare
```

Expected: `.nuxt/types/imports.d.ts` lists `#layers/core` alias and any future layer composables.

- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "feat: scaffold core layer"
```

---

## Task 8: Shared types — User, Organization, Membership, Event, Location

**Files:**
- Create: `layers/core/shared/types/index.ts`, `user.ts`, `organization.ts`, `membership.ts`, `event.ts`, `location.ts`

Types live under `shared/` so they're importable from both the Nuxt app and the Functions package (Functions imports them via a relative path; Nuxt auto-imports from `shared/`).

- [ ] **Step 1: Create `layers/core/shared/types/user.ts`**

```ts
import type { Timestamp } from 'firebase/firestore'

export type User = {
  email: string
  displayName: string
  photoURL?: string
  orgIds: string[]
  createdAt: Timestamp
}
```

- [ ] **Step 2: Create `layers/core/shared/types/organization.ts`**

```ts
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
```

- [ ] **Step 3: Create `layers/core/shared/types/membership.ts`**

```ts
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
```

`userId` is nullable while a membership is `pending` (the invite was sent by email but the invitee hasn't signed in yet).

- [ ] **Step 4: Create `layers/core/shared/types/event.ts`**

```ts
import type { Timestamp } from 'firebase/firestore'

export type Event = {
  name: string
  slug: string
  primaryLocale: string
  primaryContacts: string[]
  status: 'planning' | 'live' | 'archived'
  dates: { start: Timestamp; end: Timestamp }
  publicSlug?: string
  publishToPublic: boolean
  createdAt: Timestamp
  deletedAt: Timestamp | null
}
```

- [ ] **Step 5: Create `layers/core/shared/types/location.ts`**

```ts
export type Location = {
  name: string
  capacity?: number
  notes?: string
  order: number
}
```

- [ ] **Step 6: Create `layers/core/shared/types/index.ts`**

```ts
export * from './user'
export * from './organization'
export * from './membership'
export * from './event'
export * from './location'
```

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "feat: add core shared types"
```

---

## Task 9: Vitest config + test helpers

**Files:**
- Create: `vitest.config.ts`, `tests/helpers/firestore-mock.ts`

We use Vitest with a tiny in-memory mock of VueFire's composables for unit-testing app composables. Firestore SDK is **not** mocked deeply — composable tests assert orchestration only; integration coverage comes from the rules tests in Plan B.

- [ ] **Step 1: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: true,
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '#layers/core': fileURLToPath(new URL('./layers/core', import.meta.url)),
    },
  },
})
```

- [ ] **Step 2: Install test deps**

```bash
pnpm add -D happy-dom @vue/test-utils
```

- [ ] **Step 3: Create `tests/helpers/firestore-mock.ts`**

```ts
import { ref } from 'vue'
import { vi } from 'vitest'

export function mockUseDocument<T>(initial: T | null = null) {
  const data = ref<T | null>(initial)
  const fn = vi.fn(() => data)
  return { data, fn }
}

export function mockUseCollection<T>(initial: T[] = []) {
  const data = ref<T[]>(initial)
  const fn = vi.fn(() => data)
  return { data, fn }
}
```

- [ ] **Step 4: Sanity-check Vitest is wired**

```bash
pnpm test
```

Expected: "No test files found" (exit code 1 is OK for now).

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "chore: add vitest + firestore mock helpers"
```

---

## Task 10: `useUserProfile` composable + tests

**Files:**
- Create: `layers/core/app/composables/useUserProfile.ts`
- Create: `tests/composables/useUserProfile.test.ts`

`useUserProfile` returns the current user's `/users/{uid}` doc reactively. It composes VueFire's `useCurrentUser` (Firebase Auth) with `useDocument` (Firestore).

- [ ] **Step 1: Write the failing test**

```ts
// tests/composables/useUserProfile.test.ts
import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'

vi.mock('vuefire', () => ({
  useCurrentUser: () => ref({ uid: 'u1' }),
  useFirestore: () => ({}),
  useDocument: vi.fn(() => ref({ email: 'a@b.c', displayName: 'A', orgIds: ['lila'] })),
}))
vi.mock('firebase/firestore', () => ({
  doc: (..._args: unknown[]) => ({ path: 'users/u1' }),
}))

import { useUserProfile } from '#layers/core/app/composables/useUserProfile'

describe('useUserProfile', () => {
  it('returns the current user profile reactively', () => {
    const profile = useUserProfile()
    expect(profile.value).toEqual({ email: 'a@b.c', displayName: 'A', orgIds: ['lila'] })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm test
```

Expected: FAIL — module not found for `useUserProfile`.

- [ ] **Step 3: Implement `useUserProfile`**

```ts
// layers/core/app/composables/useUserProfile.ts
import { computed } from 'vue'
import { useCurrentUser, useDocument, useFirestore } from 'vuefire'
import { doc } from 'firebase/firestore'
import type { User } from '#layers/core/shared/types'

export function useUserProfile() {
  const auth = useCurrentUser()
  const db = useFirestore()
  const docRef = computed(() =>
    auth.value ? doc(db, 'users', auth.value.uid) : null,
  )
  return useDocument<User>(docRef)
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm test tests/composables/useUserProfile.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat(core): add useUserProfile composable"
```

---

## Task 11: `useOrg` composable + tests

**Files:**
- Create: `layers/core/app/composables/useOrg.ts`
- Create: `tests/composables/useOrg.test.ts`

`useOrg` reads the active `orgId` and `role` from the user's ID-token claims, then returns the corresponding `/organizations/{orgId}` doc.

- [ ] **Step 1: Write the failing test**

```ts
// tests/composables/useOrg.test.ts
import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'

const idTokenResult = { claims: { orgId: 'lila', role: 'director' } }

vi.mock('vuefire', () => ({
  useCurrentUser: () => ref({
    uid: 'u1',
    getIdTokenResult: vi.fn(async () => idTokenResult),
  }),
  useFirestore: () => ({}),
  useDocument: vi.fn(() => ref({ name: 'lila. queer festival e.V.', slug: 'lila' })),
}))
vi.mock('firebase/firestore', () => ({
  doc: (..._args: unknown[]) => ({ path: 'organizations/lila' }),
}))

import { useOrg } from '#layers/core/app/composables/useOrg'

describe('useOrg', () => {
  it('returns the current org doc derived from the user claim', async () => {
    const { org, role, orgId } = await useOrg()
    expect(orgId.value).toBe('lila')
    expect(role.value).toBe('director')
    expect(org.value).toMatchObject({ name: 'lila. queer festival e.V.' })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm test tests/composables/useOrg.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `useOrg`**

```ts
// layers/core/app/composables/useOrg.ts
import { ref, computed, watch } from 'vue'
import { useCurrentUser, useDocument, useFirestore } from 'vuefire'
import { doc } from 'firebase/firestore'
import type { Organization, Role } from '#layers/core/shared/types'

export async function useOrg() {
  const user = useCurrentUser()
  const db = useFirestore()

  const orgId = ref<string | null>(null)
  const role = ref<Role | null>(null)

  async function refresh() {
    if (!user.value) {
      orgId.value = null
      role.value = null
      return
    }
    const t = await user.value.getIdTokenResult()
    orgId.value = (t.claims.orgId as string) ?? null
    role.value = (t.claims.role as Role) ?? null
  }

  await refresh()
  watch(user, refresh)

  const orgRef = computed(() =>
    orgId.value ? doc(db, 'organizations', orgId.value) : null,
  )
  const org = useDocument<Organization>(orgRef)

  return { orgId, role, org, refresh }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm test tests/composables/useOrg.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat(core): add useOrg composable"
```

---

## Task 12: `useEvents` + `useEvent` composables

**Files:**
- Create: `layers/core/app/composables/useEvents.ts`
- Create: `layers/core/app/composables/useEvent.ts`
- Create: `tests/composables/useEvents.test.ts`

- [ ] **Step 1: Write failing test for `useEvents`**

```ts
// tests/composables/useEvents.test.ts
import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'

vi.mock('vuefire', () => ({
  useFirestore: () => ({}),
  useCollection: vi.fn(() => ref([
    { name: 'lila. 2025', slug: 'lila-2025', deletedAt: null },
  ])),
}))
vi.mock('firebase/firestore', () => ({
  collection: (..._args: unknown[]) => ({ path: 'organizations/lila/events' }),
  query: (...args: unknown[]) => args,
  where: (...args: unknown[]) => ({ where: args }),
  orderBy: (...args: unknown[]) => ({ orderBy: args }),
}))

import { useEvents } from '#layers/core/app/composables/useEvents'

describe('useEvents', () => {
  it('lists non-deleted events for the given org', () => {
    const events = useEvents('lila')
    expect(events.value).toHaveLength(1)
    expect(events.value[0].slug).toBe('lila-2025')
  })
})
```

- [ ] **Step 2: Verify test fails**

```bash
pnpm test tests/composables/useEvents.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `useEvents`**

```ts
// layers/core/app/composables/useEvents.ts
import { useCollection, useFirestore } from 'vuefire'
import { collection, query, where, orderBy } from 'firebase/firestore'
import type { Event } from '#layers/core/shared/types'

export function useEvents(orgId: string) {
  const db = useFirestore()
  const ref = collection(db, 'organizations', orgId, 'events')
  return useCollection<Event>(
    query(ref, where('deletedAt', '==', null), orderBy('dates.start', 'desc')),
  )
}
```

- [ ] **Step 4: Implement `useEvent`**

```ts
// layers/core/app/composables/useEvent.ts
import { useDocument, useFirestore } from 'vuefire'
import { doc } from 'firebase/firestore'
import type { Event } from '#layers/core/shared/types'

export function useEvent(orgId: string, eventId: string) {
  const db = useFirestore()
  return useDocument<Event>(doc(db, 'organizations', orgId, 'events', eventId))
}
```

- [ ] **Step 5: Run tests**

```bash
pnpm test
```

Expected: PASS for `useEvents`. (No test for `useEvent` — single-doc reads are a thin pass-through; integration coverage in Plan B's rules tests is sufficient.)

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat(core): add useEvents + useEvent composables"
```

---

## Task 13: `useLocations` composable + tests

**Files:**
- Create: `layers/core/app/composables/useLocations.ts`
- Create: `tests/composables/useLocations.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/composables/useLocations.test.ts
import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'

vi.mock('vuefire', () => ({
  useFirestore: () => ({}),
  useCollection: vi.fn(() => ref([
    { name: 'Aktionshalle', order: 1 },
    { name: 'Clubraum',     order: 2 },
  ])),
}))
vi.mock('firebase/firestore', () => ({
  collection: (..._args: unknown[]) => ({ path: '...' }),
  query: (...args: unknown[]) => args,
  orderBy: (...args: unknown[]) => ({ orderBy: args }),
}))

import { useLocations } from '#layers/core/app/composables/useLocations'

describe('useLocations', () => {
  it('returns ordered locations for the event', () => {
    const locs = useLocations('lila', 'lila-2025')
    expect(locs.value.map((l: { name: string }) => l.name)).toEqual(['Aktionshalle', 'Clubraum'])
  })
})
```

- [ ] **Step 2: Verify test fails**

```bash
pnpm test tests/composables/useLocations.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `useLocations`**

```ts
// layers/core/app/composables/useLocations.ts
import { useCollection, useFirestore } from 'vuefire'
import { collection, query, orderBy } from 'firebase/firestore'
import type { Location } from '#layers/core/shared/types'

export function useLocations(orgId: string, eventId: string) {
  const db = useFirestore()
  const ref = collection(db, 'organizations', orgId, 'events', eventId, 'locations')
  return useCollection<Location>(query(ref, orderBy('order', 'asc')))
}
```

- [ ] **Step 4: Run the test**

```bash
pnpm test tests/composables/useLocations.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat(core): add useLocations composable"
```

---

## Task 14: `useMemberships` composable

**Files:**
- Create: `layers/core/app/composables/useMemberships.ts`

No unit test — orchestration is a thin pass-through; rules tests in Plan B verify access semantics.

- [ ] **Step 1: Implement `useMemberships`**

```ts
// layers/core/app/composables/useMemberships.ts
import { useCollection, useFirestore } from 'vuefire'
import { collection } from 'firebase/firestore'
import type { Membership } from '#layers/core/shared/types'

export function useMemberships(orgId: string) {
  const db = useFirestore()
  const ref = collection(db, 'organizations', orgId, 'memberships')
  return useCollection<Membership>(ref)
}
```

- [ ] **Step 2: Commit**

```bash
git add .
git commit -m "feat(core): add useMemberships composable"
```

---

## Task 15: `useFunctions` composable (Cloud Functions client)

**Files:**
- Create: `layers/core/app/composables/useFunctions.ts`

A typed wrapper around `httpsCallable` so each callable is a single function call from a page.

- [ ] **Step 1: Implement**

```ts
// layers/core/app/composables/useFunctions.ts
import { useNuxtApp } from '#app'
import { getFunctions, httpsCallable, type Functions } from 'firebase/functions'
import type { FirebaseApp } from 'firebase/app'

type Role = 'director' | 'booker' | 'production' | 'finance' | 'pr' | 'crew'

type Callables = {
  setMembership: (data: {
    orgId: string
    email: string
    role: Role
  }) => Promise<{ membershipId: string }>

  revokeMembership: (data: {
    orgId: string
    membershipId: string
  }) => Promise<{ ok: true }>

  claimMembership: (data: Record<string, never>) => Promise<{
    activatedOrgIds: string[]
  }>
}

export function useFunctions(): Callables {
  const { $firebaseApp } = useNuxtApp() as unknown as { $firebaseApp: FirebaseApp }
  const fns: Functions = getFunctions($firebaseApp, 'us-central1')
  const wrap = <K extends keyof Callables>(name: K) =>
    (async (data: Parameters<Callables[K]>[0]) =>
      (await httpsCallable(fns, name as string)(data)).data) as Callables[K]
  return {
    setMembership:    wrap('setMembership'),
    revokeMembership: wrap('revokeMembership'),
    claimMembership:  wrap('claimMembership'),
  }
}
```

VueFire injects `$firebaseApp` into Nuxt's app context, so this picks up emulator wiring automatically (when `vuefire.emulators.enabled` is true, the SDK rewrites the Functions endpoint to `127.0.0.1:5001`).

- [ ] **Step 2: Commit**

```bash
git add .
git commit -m "feat(core): add typed useFunctions wrapper"
```

---

## Task 16: Auth route middleware

**Files:**
- Create: `layers/core/app/middleware/auth.global.ts`

The global middleware redirects unauthenticated visitors to `/login` for every route except `/login` and `/auth/*`.

- [ ] **Step 1: Implement**

```ts
// layers/core/app/middleware/auth.global.ts
import { getCurrentUser } from 'vuefire'

export default defineNuxtRouteMiddleware(async (to) => {
  const isPublic = to.path === '/login' || to.path.startsWith('/auth/')
  if (isPublic) return
  const user = await getCurrentUser()
  if (!user) {
    return navigateTo({
      path: '/login',
      query: { redirect: to.fullPath },
    })
  }
})
```

- [ ] **Step 2: Commit**

```bash
git add .
git commit -m "feat(core): add global auth middleware"
```

---

## Task 17: Login page (magic-link + Google)

**Files:**
- Create: `layers/core/app/pages/login.vue`

Uses Firebase Auth's `sendSignInLinkToEmail` and `signInWithPopup`. The magic link redirects to `/auth/complete` (Task 18).

- [ ] **Step 1: Implement**

```vue
<!-- layers/core/app/pages/login.vue -->
<script setup lang="ts">
import { useFirebaseAuth } from 'vuefire'
import {
  GoogleAuthProvider,
  sendSignInLinkToEmail,
  signInWithPopup,
} from 'firebase/auth'

definePageMeta({ layout: false })

const { t } = useI18n()
const auth = useFirebaseAuth()!
const email = ref('')
const sent = ref(false)
const error = ref<string | null>(null)

async function sendLink() {
  error.value = null
  try {
    await sendSignInLinkToEmail(auth, email.value, {
      url: window.location.origin + '/auth/complete',
      handleCodeInApp: true,
    })
    window.localStorage.setItem('festivalmgr.signInEmail', email.value)
    sent.value = true
  }
  catch (e: unknown) {
    error.value = (e as Error)?.message ?? 'Failed to send link'
  }
}

async function signInGoogle() {
  error.value = null
  try {
    await signInWithPopup(auth, new GoogleAuthProvider())
    await navigateTo('/')
  }
  catch (e: unknown) {
    error.value = (e as Error)?.message ?? 'Google sign-in failed'
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center p-6">
    <UCard class="w-full max-w-md">
      <template #header>
        <h1 class="text-xl font-semibold">{{ t('auth.loginTitle') }}</h1>
      </template>

      <div v-if="sent" class="text-sm">
        We sent a sign-in link to <strong>{{ email }}</strong>. Open it in this browser to complete sign-in.
      </div>

      <form v-else class="space-y-4" @submit.prevent="sendLink">
        <UFormField :label="t('auth.emailPlaceholder')" name="email">
          <UInput v-model="email" type="email" required />
        </UFormField>
        <UButton type="submit" block>{{ t('auth.magicLinkLabel') }}</UButton>
        <USeparator label="or" />
        <UButton color="neutral" variant="subtle" block icon="i-simple-icons-google" @click="signInGoogle">
          {{ t('auth.googleLabel') }}
        </UButton>
        <UAlert v-if="error" color="error" :title="error" />
      </form>
    </UCard>
  </div>
</template>
```

- [ ] **Step 2: Run dev server, verify the page renders**

```bash
FIREBASE_USE_EMULATOR=1 pnpm dev
```

Then visit http://localhost:3000/login and confirm the form renders without console errors. Stop the server.

- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "feat(core): add login page (magic-link + Google)"
```

---

## Task 18: Magic-link callback page (`/auth/complete`)

**Files:**
- Create: `layers/core/app/pages/auth/complete.vue`

- [ ] **Step 1: Implement**

```vue
<!-- layers/core/app/pages/auth/complete.vue -->
<script setup lang="ts">
import { useFirebaseAuth } from 'vuefire'
import { isSignInWithEmailLink, signInWithEmailLink } from 'firebase/auth'

definePageMeta({ layout: false })

const auth = useFirebaseAuth()!
const status = ref<'pending' | 'ok' | 'error'>('pending')
const error = ref<string | null>(null)

onMounted(async () => {
  if (!isSignInWithEmailLink(auth, window.location.href)) {
    status.value = 'error'
    error.value = 'This page expects a magic link.'
    return
  }
  let email = window.localStorage.getItem('festivalmgr.signInEmail')
  if (!email) email = window.prompt('Confirm the email address you signed in with') ?? ''
  try {
    await signInWithEmailLink(auth, email, window.location.href)
    window.localStorage.removeItem('festivalmgr.signInEmail')
    status.value = 'ok'
    await navigateTo('/')
  }
  catch (e: unknown) {
    status.value = 'error'
    error.value = (e as Error)?.message ?? 'Sign-in failed'
  }
})
</script>

<template>
  <div class="min-h-screen flex items-center justify-center p-6">
    <UCard>
      <p v-if="status === 'pending'">Completing sign-in…</p>
      <UAlert v-else-if="status === 'error'" color="error" :title="error ?? 'Sign-in failed'" />
      <p v-else>Signed in. Redirecting…</p>
    </UCard>
  </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add .
git commit -m "feat(core): handle magic-link callback at /auth/complete"
```

---

## Task 19: Post-sign-in plugin: activate pending memberships

**Files:**
- Create: `layers/core/app/plugins/claim-membership.client.ts`

When a user signs in for the first time, this plugin invokes the `claimMembership` callable to activate any pending invites matching their email and force a token refresh so new claims are picked up.

- [ ] **Step 1: Implement**

```ts
// layers/core/app/plugins/claim-membership.client.ts
import { watch } from 'vue'
import { useCurrentUser } from 'vuefire'

export default defineNuxtPlugin(async () => {
  const user = useCurrentUser()

  async function activate() {
    if (!user.value) return
    const { claimMembership } = useFunctions()
    try {
      const { activatedOrgIds } = await claimMembership({})
      if (activatedOrgIds.length > 0) {
        await user.value.getIdToken(true)
      }
    }
    catch {
      // Non-fatal: page guards handle the no-org case.
    }
  }

  await activate()
  watch(user, activate)
})
```

- [ ] **Step 2: Commit**

```bash
git add .
git commit -m "feat(core): activate pending memberships on sign-in"
```

---

## Task 20: AppShell + dashboard placeholder + sign-out

**Files:**
- Create: `layers/core/app/components/AppShell.vue`, `layers/core/app/pages/index.vue`

- [ ] **Step 1: Implement `AppShell.vue`**

```vue
<!-- layers/core/app/components/AppShell.vue -->
<script setup lang="ts">
import { useFirebaseAuth } from 'vuefire'
import { signOut } from 'firebase/auth'

const auth = useFirebaseAuth()!
const { t } = useI18n()

const navItems = [
  { label: t('nav.events'),   to: '/events',           icon: 'i-lucide-calendar' },
  { label: t('nav.members'),  to: '/settings/members', icon: 'i-lucide-users' },
  { label: t('nav.settings'), to: '/settings',         icon: 'i-lucide-settings' },
]

async function doSignOut() {
  await signOut(auth)
  await navigateTo('/login')
}
</script>

<template>
  <div class="min-h-screen grid grid-cols-[260px_1fr]">
    <aside class="border-r border-default p-4 flex flex-col gap-4">
      <div class="text-lg font-semibold">{{ t('app.title') }}</div>
      <UNavigationMenu :items="navItems" orientation="vertical" />
      <div class="mt-auto">
        <UButton variant="subtle" block @click="doSignOut">{{ t('nav.signOut') }}</UButton>
      </div>
    </aside>
    <main class="p-6">
      <slot />
    </main>
  </div>
</template>
```

- [ ] **Step 2: Implement `pages/index.vue`**

```vue
<!-- layers/core/app/pages/index.vue -->
<script setup lang="ts">
const { org, role } = await useOrg()
</script>

<template>
  <AppShell>
    <h1 class="text-2xl font-semibold mb-4">Welcome</h1>
    <p v-if="org">You're in <strong>{{ org.name }}</strong> as <strong>{{ role }}</strong>.</p>
    <UAlert v-else color="warning" title="No organization yet" description="Ask a director to invite you, or run scripts/seed-director.ts to create one." />
  </AppShell>
</template>
```

- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "feat(core): add AppShell + dashboard"
```

---

## Task 21: Functions package scaffold

**Files:**
- Create: `functions/package.json`, `functions/tsconfig.json`, `functions/vitest.config.ts`, `functions/src/index.ts`

- [ ] **Step 1: Create `functions/package.json`**

```json
{
  "name": "festivalmgr-functions",
  "version": "0.0.1",
  "private": true,
  "main": "lib/index.js",
  "engines": { "node": "22" },
  "scripts": {
    "build": "tsc",
    "build:watch": "tsc --watch",
    "serve": "pnpm build && firebase emulators:start --only functions",
    "shell": "pnpm build && firebase functions:shell",
    "deploy": "firebase deploy --only functions",
    "logs": "firebase functions:log",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "firebase-admin": "^13.0.0",
    "firebase-functions": "^6.0.0"
  },
  "devDependencies": {
    "firebase-functions-test": "^3.4.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `functions/tsconfig.json`**

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "es2022",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "strict": true,
    "noImplicitReturns": true,
    "outDir": "lib",
    "sourceMap": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"],
  "exclude": ["src/test/**/*"]
}
```

- [ ] **Step 3: Create `functions/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/test/**/*.test.ts'],
  },
})
```

- [ ] **Step 4: Create `functions/src/index.ts` (re-exports)**

```ts
export { setMembership }    from './core/setMembership'
export { revokeMembership } from './core/revokeMembership'
export { claimMembership }  from './core/claimMembership'
```

- [ ] **Step 5: Install function deps**

```bash
pnpm --filter ./functions install
```

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "chore(functions): scaffold functions package"
```

---

## Task 22: Functions helpers — caller-role assertions

**Files:**
- Create: `functions/src/core/helpers.ts`

- [ ] **Step 1: Implement**

```ts
// functions/src/core/helpers.ts
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https'

export type Role = 'director' | 'booker' | 'production' | 'finance' | 'pr' | 'crew'

export function assertSignedIn(req: CallableRequest): asserts req is CallableRequest & { auth: NonNullable<CallableRequest['auth']> } {
  if (!req.auth) {
    throw new HttpsError('unauthenticated', 'Sign-in required.')
  }
}

export function assertCallerHasRoleInOrg(
  req: CallableRequest,
  orgId: string,
  allowedRoles: Role[],
): void {
  assertSignedIn(req)
  const claims = req.auth.token as { orgId?: string; role?: Role }
  if (claims.orgId !== orgId || !claims.role || !allowedRoles.includes(claims.role)) {
    throw new HttpsError('permission-denied', `Required role(s): ${allowedRoles.join(', ')}.`)
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add .
git commit -m "feat(functions): add caller-role assertion helpers"
```

---

## Task 23: `setMembership` callable + test

**Files:**
- Create: `functions/src/core/setMembership.ts`
- Create: `functions/src/test/setup.ts`, `functions/src/test/setMembership.test.ts`

The callable creates a `pending` membership for a given email. The director must already be a director of the target org.

- [ ] **Step 1: Implement `functions/src/test/setup.ts`**

```ts
// functions/src/test/setup.ts
import functionsTest from 'firebase-functions-test'

export const test = functionsTest()

afterAll(() => test.cleanup())
```

- [ ] **Step 2: Write the failing test**

```ts
// functions/src/test/setMembership.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { test } from './setup'

const set = vi.fn(async () => undefined)
const docRef = { id: 'mem123', set }
const collectionRef = { doc: vi.fn(() => docRef) }

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(() => ({})), getApps: () => [] }))
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: vi.fn(() => collectionRef),
  }),
  FieldValue: { serverTimestamp: () => '__SERVER_TS__' },
}))

import { setMembership } from '../core/setMembership'

describe('setMembership', () => {
  beforeEach(() => { set.mockClear(); collectionRef.doc.mockClear() })

  it('rejects non-directors', async () => {
    const wrapped = test.wrap(setMembership)
    await expect(wrapped({
      data: { orgId: 'lila', email: 'a@b.c', role: 'booker' },
      auth: { uid: 'caller', token: { orgId: 'lila', role: 'booker' } },
    } as never)).rejects.toMatchObject({ code: 'permission-denied' })
  })

  it('writes a pending membership doc when caller is director', async () => {
    const wrapped = test.wrap(setMembership)
    const result = await wrapped({
      data: { orgId: 'lila', email: 'newbie@example.com', role: 'production' },
      auth: { uid: 'director', token: { orgId: 'lila', role: 'director' } },
    } as never)
    expect(result).toEqual({ membershipId: 'mem123' })
    expect(set).toHaveBeenCalledWith(expect.objectContaining({
      email: 'newbie@example.com',
      role: 'production',
      status: 'pending',
      invitedBy: 'director',
    }))
  })
})
```

- [ ] **Step 3: Verify test fails**

```bash
pnpm --filter ./functions test
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement `setMembership`**

```ts
// functions/src/core/setMembership.ts
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { assertCallerHasRoleInOrg, type Role } from './helpers'

if (!getApps().length) initializeApp()

type Data = { orgId: string; email: string; role: Role }

export const setMembership = onCall<Data>(async (req) => {
  const { orgId, email, role } = req.data ?? ({} as Data)
  if (!orgId || !email || !role) {
    throw new HttpsError('invalid-argument', 'orgId, email and role are required.')
  }
  assertCallerHasRoleInOrg(req, orgId, ['director'])

  const db = getFirestore()
  const ref = db.collection(`organizations/${orgId}/memberships`).doc()
  await ref.set({
    userId: null,
    email: email.trim().toLowerCase(),
    role,
    invitedBy: req.auth!.uid,
    invitedAt: FieldValue.serverTimestamp(),
    acceptedAt: null,
    status: 'pending',
  })
  return { membershipId: ref.id }
})
```

- [ ] **Step 5: Verify test passes**

```bash
pnpm --filter ./functions test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat(functions): add setMembership callable"
```

---

## Task 24: `revokeMembership` callable + test

**Files:**
- Create: `functions/src/core/revokeMembership.ts`, `functions/src/test/revokeMembership.test.ts`

Director-only. Flips an existing membership to `status: 'revoked'` and clears the user's custom claim if the membership was active.

- [ ] **Step 1: Write the failing test**

```ts
// functions/src/test/revokeMembership.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { test } from './setup'

const update = vi.fn(async () => undefined)
const docSnap = { exists: true, data: () => ({ userId: 'u-target', status: 'active' }) }
const docRef = { get: vi.fn(async () => docSnap), update }
const setCustomUserClaims = vi.fn(async () => undefined)

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(() => ({})), getApps: () => [] }))
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({ doc: vi.fn(() => docRef) }),
  FieldValue: { serverTimestamp: () => '__SERVER_TS__' },
}))
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({ setCustomUserClaims }),
}))

import { revokeMembership } from '../core/revokeMembership'

describe('revokeMembership', () => {
  beforeEach(() => { update.mockClear(); setCustomUserClaims.mockClear() })

  it('rejects non-directors', async () => {
    const wrapped = test.wrap(revokeMembership)
    await expect(wrapped({
      data: { orgId: 'lila', membershipId: 'm1' },
      auth: { uid: 'caller', token: { orgId: 'lila', role: 'pr' } },
    } as never)).rejects.toMatchObject({ code: 'permission-denied' })
  })

  it('marks revoked + clears claims for the affected user', async () => {
    const wrapped = test.wrap(revokeMembership)
    await wrapped({
      data: { orgId: 'lila', membershipId: 'm1' },
      auth: { uid: 'director', token: { orgId: 'lila', role: 'director' } },
    } as never)
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: 'revoked' }))
    expect(setCustomUserClaims).toHaveBeenCalledWith('u-target', null)
  })
})
```

- [ ] **Step 2: Verify test fails**

```bash
pnpm --filter ./functions test
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// functions/src/core/revokeMembership.ts
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { assertCallerHasRoleInOrg } from './helpers'

if (!getApps().length) initializeApp()

type Data = { orgId: string; membershipId: string }

export const revokeMembership = onCall<Data>(async (req) => {
  const { orgId, membershipId } = req.data ?? ({} as Data)
  if (!orgId || !membershipId) {
    throw new HttpsError('invalid-argument', 'orgId and membershipId are required.')
  }
  assertCallerHasRoleInOrg(req, orgId, ['director'])

  const db = getFirestore()
  const ref = db.doc(`organizations/${orgId}/memberships/${membershipId}`)
  const snap = await ref.get()
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Membership not found.')
  }
  const m = snap.data() as { userId: string | null; status: string }

  await ref.update({
    status: 'revoked',
    revokedAt: FieldValue.serverTimestamp(),
  })
  if (m.userId && m.status === 'active') {
    await getAuth().setCustomUserClaims(m.userId, null)
  }
  return { ok: true as const }
})
```

- [ ] **Step 4: Verify test passes**

```bash
pnpm --filter ./functions test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat(functions): add revokeMembership callable"
```

---

## Task 25: `claimMembership` callable + test

**Files:**
- Create: `functions/src/core/claimMembership.ts`, `functions/src/test/claimMembership.test.ts`

Invoked by the client right after sign-in. Looks up pending memberships matching the user's email, flips them to `active`, sets `userId`, writes the custom claim (`orgId`, `role`), and creates / updates the `/users/{uid}` doc.

- [ ] **Step 1: Write the failing test**

```ts
// functions/src/test/claimMembership.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { test } from './setup'

const updateMembership = vi.fn(async () => undefined)
const setCustomUserClaims = vi.fn(async () => undefined)
const userDocRef = {
  set: vi.fn(async () => undefined),
  update: vi.fn(async () => undefined),
  get: vi.fn(async () => ({ exists: false })),
}

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(() => ({})), getApps: () => [] }))
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collectionGroup: vi.fn(() => ({
      where: vi.fn(() => ({
        where: vi.fn(() => ({
          get: vi.fn(async () => ({
            docs: [
              {
                ref: { update: updateMembership, parent: { parent: { id: 'lila' } } },
                data: () => ({ email: 'invitee@example.com', role: 'production', status: 'pending' }),
              },
            ],
          })),
        })),
      })),
    })),
    doc: vi.fn(() => userDocRef),
  }),
  FieldValue: {
    serverTimestamp: () => '__SERVER_TS__',
    arrayUnion: (...x: string[]) => ({ arrayUnion: x }),
  },
}))
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({ setCustomUserClaims }),
}))

import { claimMembership } from '../core/claimMembership'

describe('claimMembership', () => {
  beforeEach(() => {
    updateMembership.mockClear()
    setCustomUserClaims.mockClear()
    userDocRef.set.mockClear()
  })

  it('activates pending memberships for caller email and sets claims', async () => {
    const wrapped = test.wrap(claimMembership)
    const result = await wrapped({
      data: {},
      auth: { uid: 'u-invitee', token: { email: 'invitee@example.com' } },
    } as never)
    expect(result.activatedOrgIds).toEqual(['lila'])
    expect(updateMembership).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'u-invitee',
      status: 'active',
    }))
    expect(setCustomUserClaims).toHaveBeenCalledWith('u-invitee', expect.objectContaining({
      orgId: 'lila',
      role: 'production',
    }))
    expect(userDocRef.set).toHaveBeenCalledWith(expect.objectContaining({
      email: 'invitee@example.com',
      orgIds: ['lila'],
    }))
  })
})
```

- [ ] **Step 2: Verify test fails**

```bash
pnpm --filter ./functions test
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// functions/src/core/claimMembership.ts
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'

if (!getApps().length) initializeApp()

export const claimMembership = onCall(async (req) => {
  if (!req.auth) {
    throw new HttpsError('unauthenticated', 'Sign-in required.')
  }
  const uid = req.auth.uid
  const email = String(req.auth.token.email ?? '').toLowerCase()
  if (!email) {
    return { activatedOrgIds: [] as string[] }
  }

  const db = getFirestore()
  const snap = await db
    .collectionGroup('memberships')
    .where('email', '==', email)
    .where('status', '==', 'pending')
    .get()

  const activatedOrgIds: string[] = []
  let primary: { orgId: string; role: string } | null = null

  for (const doc of snap.docs) {
    const orgId = doc.ref.parent.parent!.id
    const role = (doc.data() as { role: string }).role
    await doc.ref.update({
      userId: uid,
      status: 'active',
      acceptedAt: FieldValue.serverTimestamp(),
    })
    activatedOrgIds.push(orgId)
    if (!primary) primary = { orgId, role }
  }

  if (primary) {
    await getAuth().setCustomUserClaims(uid, {
      orgId: primary.orgId,
      role: primary.role,
      orgs: Object.fromEntries(activatedOrgIds.map((o, i) => [o, i === 0 ? primary!.role : 'crew'])),
    })

    const userRef = db.doc(`users/${uid}`)
    const u = await userRef.get()
    if (u.exists) {
      await userRef.update({ orgIds: FieldValue.arrayUnion(...activatedOrgIds) })
    }
    else {
      await userRef.set({
        email,
        displayName: req.auth.token.name ?? email,
        photoURL: req.auth.token.picture ?? null,
        orgIds: activatedOrgIds,
        createdAt: FieldValue.serverTimestamp(),
      })
    }
  }

  return { activatedOrgIds }
})
```

- [ ] **Step 4: Verify test passes**

```bash
pnpm --filter ./functions test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat(functions): add claimMembership callable"
```

---

## Task 26: Settings index page (org settings)

**Files:**
- Create: `layers/core/app/pages/settings/index.vue`

Director-only edit; everyone in the org can read. Updates a small allow-list of fields (`name`, `defaultLocale`, `defaultCurrency`, `enabledModules`).

- [ ] **Step 1: Implement**

```vue
<!-- layers/core/app/pages/settings/index.vue -->
<script setup lang="ts">
import { useFirestore } from 'vuefire'
import { doc, updateDoc } from 'firebase/firestore'
import type { ModuleKey } from '#layers/core/shared/types'

const { org, orgId, role } = await useOrg()
const db = useFirestore()
const toast = useToast()

const editable = reactive({
  name: org.value?.name ?? '',
  defaultLocale: org.value?.defaultLocale ?? 'en',
  defaultCurrency: org.value?.defaultCurrency ?? 'CHF',
  enabledModules: [...(org.value?.enabledModules ?? [])] as ModuleKey[],
})

const allModules: ModuleKey[] = ['artists', 'budget', 'booking', 'riders', 'schedule']
const canEdit = computed(() => role.value === 'director')

async function save() {
  if (!orgId.value) return
  await updateDoc(doc(db, 'organizations', orgId.value), {
    name: editable.name,
    defaultLocale: editable.defaultLocale,
    defaultCurrency: editable.defaultCurrency,
    enabledModules: editable.enabledModules,
  })
  toast.add({ title: 'Settings saved', color: 'success' })
}
</script>

<template>
  <AppShell>
    <h1 class="text-2xl font-semibold mb-6">Organization settings</h1>

    <UCard v-if="org" class="max-w-xl">
      <form class="space-y-4" @submit.prevent="save">
        <UFormField label="Name" name="name">
          <UInput v-model="editable.name" :disabled="!canEdit" />
        </UFormField>
        <UFormField label="Default locale" name="defaultLocale">
          <UInput v-model="editable.defaultLocale" :disabled="!canEdit" />
        </UFormField>
        <UFormField label="Default currency" name="defaultCurrency">
          <UInput v-model="editable.defaultCurrency" :disabled="!canEdit" />
        </UFormField>
        <UFormField label="Enabled modules" name="enabledModules">
          <div class="flex flex-wrap gap-2">
            <UCheckbox
              v-for="m in allModules"
              :key="m"
              :model-value="editable.enabledModules.includes(m)"
              :disabled="!canEdit"
              :label="m"
              @update:model-value="(checked: boolean) => editable.enabledModules = checked
                ? [...editable.enabledModules, m]
                : editable.enabledModules.filter(x => x !== m)" />
          </div>
        </UFormField>
        <UButton v-if="canEdit" type="submit">Save</UButton>
      </form>
    </UCard>
    <UAlert v-else color="warning" title="No organization on this account" />
  </AppShell>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add .
git commit -m "feat(core): add org settings page"
```

---

## Task 27: Member admin page

**Files:**
- Create: `layers/core/app/pages/settings/members.vue`, `layers/core/app/components/MemberRow.vue`

- [ ] **Step 1: Implement `MemberRow.vue`**

```vue
<!-- layers/core/app/components/MemberRow.vue -->
<script setup lang="ts">
import type { Membership, Role } from '#layers/core/shared/types'

const props = defineProps<{
  membership: Membership & { id: string }
  canRevoke: boolean
}>()
const emit = defineEmits<{ revoke: [id: string] }>()

const roleColor: Record<Role, string> = {
  director: 'primary', booker: 'info', production: 'success',
  finance: 'warning', pr: 'secondary', crew: 'neutral',
}
const statusColor: Record<Membership['status'], string> = {
  active: 'success', pending: 'warning', revoked: 'neutral',
}
</script>

<template>
  <div class="flex items-center gap-3 py-2 border-b border-default last:border-0">
    <div class="flex-1">
      <div class="font-medium">{{ props.membership.email }}</div>
      <div class="text-xs text-muted">{{ props.membership.userId ?? '—' }}</div>
    </div>
    <UBadge :color="roleColor[props.membership.role]" variant="subtle">{{ props.membership.role }}</UBadge>
    <UBadge :color="statusColor[props.membership.status]" variant="subtle">{{ props.membership.status }}</UBadge>
    <UButton
      v-if="props.canRevoke && props.membership.status !== 'revoked'"
      size="xs"
      color="error"
      variant="ghost"
      @click="emit('revoke', props.membership.id)">
      Revoke
    </UButton>
  </div>
</template>
```

- [ ] **Step 2: Implement `members.vue`**

```vue
<!-- layers/core/app/pages/settings/members.vue -->
<script setup lang="ts">
import type { Role } from '#layers/core/shared/types'

const { orgId, role } = await useOrg()
const fns = useFunctions()
const toast = useToast()

const memberships = orgId.value ? useMemberships(orgId.value) : ref([])
const canManage = computed(() => role.value === 'director')

const inviteEmail = ref('')
const inviteRole = ref<Role>('crew')
const submitting = ref(false)

async function invite() {
  if (!orgId.value || !inviteEmail.value) return
  submitting.value = true
  try {
    await fns.setMembership({
      orgId: orgId.value,
      email: inviteEmail.value,
      role: inviteRole.value,
    })
    toast.add({ title: 'Invite sent', color: 'success' })
    inviteEmail.value = ''
  }
  catch (e: unknown) {
    toast.add({ title: 'Invite failed', description: (e as Error)?.message, color: 'error' })
  }
  finally {
    submitting.value = false
  }
}

async function revoke(membershipId: string) {
  if (!orgId.value) return
  try {
    await fns.revokeMembership({ orgId: orgId.value, membershipId })
    toast.add({ title: 'Revoked', color: 'success' })
  }
  catch (e: unknown) {
    toast.add({ title: 'Revoke failed', description: (e as Error)?.message, color: 'error' })
  }
}

const roleOptions: Role[] = ['director', 'booker', 'production', 'finance', 'pr', 'crew']
</script>

<template>
  <AppShell>
    <h1 class="text-2xl font-semibold mb-6">Members</h1>

    <UCard v-if="canManage" class="mb-6">
      <template #header>
        <h2 class="font-medium">Invite teammate</h2>
      </template>
      <form class="flex gap-2 items-end" @submit.prevent="invite">
        <UFormField label="Email" class="flex-1">
          <UInput v-model="inviteEmail" type="email" required />
        </UFormField>
        <UFormField label="Role">
          <USelect v-model="inviteRole" :items="roleOptions" />
        </UFormField>
        <UButton type="submit" :loading="submitting">Invite</UButton>
      </form>
    </UCard>

    <UCard>
      <MemberRow
        v-for="m in memberships"
        :key="m.id"
        :membership="m"
        :can-revoke="canManage"
        @revoke="revoke" />
      <p v-if="memberships.length === 0" class="text-sm text-muted">No members yet.</p>
    </UCard>
  </AppShell>
</template>
```

- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "feat(core): add member admin page + row component"
```

---

## Task 28: Events index page

**Files:**
- Create: `layers/core/app/pages/events/index.vue`, `layers/core/app/components/EventCard.vue`

- [ ] **Step 1: Implement `EventCard.vue`**

```vue
<!-- layers/core/app/components/EventCard.vue -->
<script setup lang="ts">
import type { Event } from '#layers/core/shared/types'
const props = defineProps<{ event: Event & { id: string } }>()
const dateRange = computed(() => {
  const s = props.event.dates.start.toDate()
  const e = props.event.dates.end.toDate()
  return `${s.toLocaleDateString()} – ${e.toLocaleDateString()}`
})
</script>

<template>
  <NuxtLink :to="`/events/${props.event.id}`">
    <UCard class="hover:bg-elevated transition-colors">
      <div class="flex justify-between items-start">
        <div>
          <div class="font-medium">{{ props.event.name }}</div>
          <div class="text-xs text-muted">{{ dateRange }}</div>
        </div>
        <UBadge variant="subtle">{{ props.event.status }}</UBadge>
      </div>
    </UCard>
  </NuxtLink>
</template>
```

- [ ] **Step 2: Implement `events/index.vue`**

```vue
<!-- layers/core/app/pages/events/index.vue -->
<script setup lang="ts">
import { useFirestore } from 'vuefire'
import { addDoc, collection, Timestamp } from 'firebase/firestore'

const { orgId, role } = await useOrg()
const db = useFirestore()
const events = orgId.value ? useEvents(orgId.value) : ref([])
const canCreate = computed(() => role.value === 'director')

const open = ref(false)
const draft = reactive({ name: '', slug: '', start: '', end: '' })

async function create() {
  if (!orgId.value) return
  await addDoc(collection(db, 'organizations', orgId.value, 'events'), {
    name: draft.name,
    slug: draft.slug,
    primaryLocale: 'en',
    primaryContacts: [],
    status: 'planning',
    dates: {
      start: Timestamp.fromDate(new Date(draft.start)),
      end: Timestamp.fromDate(new Date(draft.end)),
    },
    publishToPublic: false,
    createdAt: Timestamp.now(),
    deletedAt: null,
  })
  open.value = false
  Object.assign(draft, { name: '', slug: '', start: '', end: '' })
}
</script>

<template>
  <AppShell>
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-2xl font-semibold">Events</h1>
      <UButton v-if="canCreate" icon="i-lucide-plus" @click="open = true">New event</UButton>
    </div>

    <div class="grid gap-3">
      <EventCard v-for="e in events" :key="e.id" :event="e" />
      <UAlert v-if="events.length === 0" color="neutral" title="No events yet" />
    </div>

    <UModal v-model:open="open" title="New event">
      <template #body>
        <form class="space-y-3" @submit.prevent="create">
          <UFormField label="Name"><UInput v-model="draft.name" required /></UFormField>
          <UFormField label="Slug"><UInput v-model="draft.slug" required /></UFormField>
          <UFormField label="Start date"><UInput v-model="draft.start" type="date" required /></UFormField>
          <UFormField label="End date"><UInput v-model="draft.end" type="date" required /></UFormField>
          <UButton type="submit">Create</UButton>
        </form>
      </template>
    </UModal>
  </AppShell>
</template>
```

- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "feat(core): add events index + card component"
```

---

## Task 29: Event detail page (with locations CRUD)

**Files:**
- Create: `layers/core/app/pages/events/[eventId].vue`, `layers/core/app/components/LocationListItem.vue`

- [ ] **Step 1: Implement `LocationListItem.vue`**

```vue
<!-- layers/core/app/components/LocationListItem.vue -->
<script setup lang="ts">
import type { Location } from '#layers/core/shared/types'
const props = defineProps<{
  location: Location & { id: string }
  canEdit: boolean
}>()
const emit = defineEmits<{ remove: [id: string] }>()
</script>

<template>
  <div class="flex items-center gap-3 py-2 border-b border-default last:border-0">
    <span class="font-mono text-xs w-6 text-muted">{{ props.location.order }}</span>
    <div class="flex-1">
      <div class="font-medium">{{ props.location.name }}</div>
      <div v-if="props.location.capacity" class="text-xs text-muted">Capacity: {{ props.location.capacity }}</div>
    </div>
    <UButton v-if="props.canEdit" size="xs" variant="ghost" color="error" @click="emit('remove', props.location.id)">Remove</UButton>
  </div>
</template>
```

- [ ] **Step 2: Implement `[eventId].vue`**

```vue
<!-- layers/core/app/pages/events/[eventId].vue -->
<script setup lang="ts">
import { useFirestore } from 'vuefire'
import { addDoc, collection, deleteDoc, doc } from 'firebase/firestore'

const route = useRoute()
const eventId = route.params.eventId as string
const { orgId, role } = await useOrg()
const db = useFirestore()

if (!orgId.value) throw createError({ statusCode: 403, message: 'No organization on this account' })

const event = useEvent(orgId.value, eventId)
const locations = useLocations(orgId.value, eventId)
const canEdit = computed(() => role.value === 'director' || role.value === 'production')

const draft = reactive({ name: '', capacity: undefined as number | undefined })

async function addLocation() {
  if (!orgId.value || !draft.name) return
  await addDoc(collection(db, 'organizations', orgId.value, 'events', eventId, 'locations'), {
    name: draft.name,
    capacity: draft.capacity ?? null,
    order: locations.value.length + 1,
  })
  draft.name = ''
  draft.capacity = undefined
}

async function removeLocation(id: string) {
  if (!orgId.value) return
  await deleteDoc(doc(db, 'organizations', orgId.value, 'events', eventId, 'locations', id))
}
</script>

<template>
  <AppShell>
    <NuxtLink to="/events" class="text-sm text-muted hover:underline">← All events</NuxtLink>
    <h1 v-if="event" class="text-2xl font-semibold mb-6">{{ event.name }}</h1>

    <UCard>
      <template #header><h2 class="font-medium">Locations</h2></template>

      <LocationListItem
        v-for="l in locations"
        :key="l.id"
        :location="l"
        :can-edit="canEdit"
        @remove="removeLocation" />
      <p v-if="locations.length === 0" class="text-sm text-muted">No locations yet.</p>

      <form v-if="canEdit" class="flex gap-2 items-end mt-4" @submit.prevent="addLocation">
        <UFormField label="Name" class="flex-1"><UInput v-model="draft.name" required /></UFormField>
        <UFormField label="Capacity"><UInput v-model.number="draft.capacity" type="number" min="0" /></UFormField>
        <UButton type="submit">Add</UButton>
      </form>
    </UCard>
  </AppShell>
</template>
```

- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "feat(core): add event detail page with locations CRUD"
```

---

## Task 30: `seed-director` + `seed-emulator` scripts

**Files:**
- Create: `scripts/seed-director.ts`, `scripts/seed-emulator.ts`

`seed-director.ts` is the one-off script for staging/prod that creates the very first org + director (per spec §7). `seed-emulator.ts` wraps it for local dev: it talks to the emulator, creates the lila org, a director user, and one event with two locations.

- [ ] **Step 1: Implement `seed-director.ts`**

```ts
// scripts/seed-director.ts
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

type Args = {
  orgId: string
  orgName: string
  orgSlug: string
  email: string
  displayName: string
}

export async function seedDirector(args: Args) {
  if (!getApps().length) {
    const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
    initializeApp(credPath ? { credential: cert(credPath) } : {})
  }
  const auth = getAuth()
  const db = getFirestore()

  let user
  try {
    user = await auth.getUserByEmail(args.email)
  }
  catch {
    user = await auth.createUser({
      email: args.email,
      displayName: args.displayName,
      emailVerified: true,
    })
  }

  await db.doc(`organizations/${args.orgId}`).set({
    name: args.orgName,
    slug: args.orgSlug,
    defaultLocale: 'en',
    defaultCurrency: 'CHF',
    enabledModules: ['artists', 'budget', 'booking', 'riders', 'schedule'],
    createdAt: FieldValue.serverTimestamp(),
  })

  await db.doc(`organizations/${args.orgId}/memberships/${user.uid}`).set({
    userId: user.uid,
    email: args.email.toLowerCase(),
    role: 'director',
    invitedBy: user.uid,
    invitedAt: FieldValue.serverTimestamp(),
    acceptedAt: FieldValue.serverTimestamp(),
    status: 'active',
  })

  await db.doc(`users/${user.uid}`).set({
    email: args.email.toLowerCase(),
    displayName: args.displayName,
    orgIds: [args.orgId],
    createdAt: FieldValue.serverTimestamp(),
  }, { merge: true })

  await auth.setCustomUserClaims(user.uid, {
    orgId: args.orgId,
    role: 'director',
    orgs: { [args.orgId]: 'director' },
  })

  return { uid: user.uid }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [orgId, orgName, orgSlug, email, displayName] = process.argv.slice(2)
  if (!orgId || !email) {
    console.error('Usage: tsx scripts/seed-director.ts <orgId> <orgName> <orgSlug> <email> <displayName>')
    process.exit(1)
  }
  seedDirector({ orgId, orgName, orgSlug, email, displayName: displayName ?? email })
    .then(({ uid }) => console.log(`Seeded director ${email} (${uid}) into org ${orgId}.`))
    .catch((e) => { console.error(e); process.exit(1) })
}
```

- [ ] **Step 2: Implement `seed-emulator.ts`**

```ts
// scripts/seed-emulator.ts
import { seedDirector } from './seed-director'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099'
process.env.GCLOUD_PROJECT = 'festivalmgr-dev'

async function main() {
  const { uid } = await seedDirector({
    orgId: 'lila',
    orgName: 'lila. queer festival e.V.',
    orgSlug: 'lila',
    email: 'director@example.com',
    displayName: 'Lila Director',
  })

  const db = getFirestore()
  const eventRef = db.collection('organizations/lila/events').doc('lila-2025')
  await eventRef.set({
    name: 'lila. queer festival 2025',
    slug: 'lila-2025',
    primaryLocale: 'en',
    primaryContacts: [uid],
    status: 'planning',
    dates: {
      start: Timestamp.fromDate(new Date('2025-09-12')),
      end:   Timestamp.fromDate(new Date('2025-09-14')),
    },
    publishToPublic: false,
    createdAt: Timestamp.now(),
    deletedAt: null,
  })

  await eventRef.collection('locations').doc('aktionshalle')
    .set({ name: 'Aktionshalle', capacity: 600, order: 1 })
  await eventRef.collection('locations').doc('clubraum')
    .set({ name: 'Clubraum', capacity: 250, order: 2 })

  console.log('Seeded emulator: org=lila, director=director@example.com, event=lila-2025, 2 locations.')
}

main().catch((e) => { console.error(e); process.exit(1) })
```

- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "feat: add seed-director + seed-emulator scripts"
```

---

## Task 31: README — dev onboarding

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace `README.md`**

```markdown
# festivalmgr

Cloud-based, multi-tenant SaaS for organizing community-based arts/music/culture festivals.

## Architecture

See [docs/superpowers/specs/2026-05-08-festivalmgr-platform-foundation-design.md](docs/superpowers/specs/2026-05-08-festivalmgr-platform-foundation-design.md).

## Local development

Prerequisites:
- Node 22 (`nvm use`)
- pnpm 9+
- Firebase CLI is included as a dev dep — invoke as `pnpm exec firebase ...`.

First-time setup:

```bash
pnpm install
cp .env.example .env
pnpm --filter ./functions install
```

Run the app + emulators:

```bash
pnpm dev
```

This boots the Firebase emulator suite (Auth, Firestore, Functions, Storage on ports 9099/8080/5001/9199, UI on 4000) and the Nuxt dev server (port 3000) in parallel.

Seed the emulator with a director user, the lila. org, and one event:

```bash
pnpm dev:seed
```

Sign in as `director@example.com` from `/login`. The Auth emulator logs the magic-link URL to its console output — open it in the same browser to complete sign-in.

## Tests

```bash
pnpm test            # composable unit tests
pnpm test:functions  # Cloud Functions tests
```

## Project layout

- `app/` — root entry (`app.vue`, `assets/css/main.css`).
- `layers/core/` — the always-loaded core layer (auth, org settings, member admin, events, locations).
  - `app/` — components, composables, pages, plugins, middleware.
  - `shared/types/` — Firestore document types.
- `functions/` — Cloud Functions (TypeScript).
- `scripts/` — one-off ops scripts (`seed-director`, `seed-emulator`).
- `firestore.rules`, `storage.rules` — **permissive starter rules**, replaced in Plan B.

## What's next

- **Plan B:** layered, role-aware Firestore + Storage rules + emulator rules-test suite.
- **Plan C:** GitHub Actions CI, Netlify production config, daily Firestore backups.
- **Module brainstorms:** Artists → Schedule → Booking/Advancing → Riders → Budget.
```

- [ ] **Step 2: Commit**

```bash
git add .
git commit -m "docs: add dev onboarding README"
```

---

## Task 32: End-to-end smoke check

A final manual pass to confirm Plan A is working before handing off.

- [ ] **Step 1: Reset and reseed**

```bash
rm -rf .emulator-data
pnpm dev          # in one terminal
pnpm dev:seed     # in another
```

- [ ] **Step 2: Sign in as director**

Open http://localhost:3000/login. Enter `director@example.com`, click "Send sign-in link". The emulator UI's Auth tab will show a magic-link URL — open it in the same browser. After redirect you should land on `/` with "You're in lila. queer festival e.V. as director."

- [ ] **Step 3: Invite a teammate**

Navigate to `/settings/members`. Invite `pr@example.com` as `pr`. The new pending row appears.

- [ ] **Step 4: Sign in as the invitee**

Sign out, sign in with `pr@example.com` via magic-link. After redirect, the dashboard should say "You're in lila. queer festival e.V. as pr." The membership row in the director's view should now read `active`.

- [ ] **Step 5: Edit org settings**

As director, change "Default currency" from CHF to EUR in `/settings`. Refresh — the value persists.

- [ ] **Step 6: Add an event + location**

In `/events`, create a second event. Open it. Add a location named "Marktstand". Reload the page — it persists.

- [ ] **Step 7: Revoke**

Back as director, revoke the `pr@example.com` membership. Sign in as `pr@example.com` again — the dashboard should now show the "No organization yet" alert.

- [ ] **Step 8: Run all tests**

```bash
pnpm test
pnpm test:functions
pnpm typecheck
```

Expected: all green.

- [ ] **Step 9: Final commit if anything was tweaked during smoke**

```bash
git add .
git commit -m "chore: smoke-check fixes" || echo "No changes"
```

---

## Plan A is done

When all tasks are checked off, the foundation supports:
- Sign-in via magic-link or Google.
- Multi-tenant data layout with org-level membership.
- Director can invite, revoke, and edit settings.
- Anyone in the org can browse events and locations; production+director can edit locations.
- The Cloud Functions surface (`setMembership`, `revokeMembership`, `claimMembership`) is unit-tested.
- The emulator dev workflow is one command and reproducible from a clean clone.

**Next:** Plan B (rules + rules tests), then the Artists module brainstorm.
