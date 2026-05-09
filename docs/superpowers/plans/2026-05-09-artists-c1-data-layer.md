# Artist Module — C1: Data Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the artist module's data layer — core type extensions, the `layers/artists/` skeleton, all seven artist composables (`useArtistList` / `useArtist` / `useArtistMutations` / `useArtistResources` / `useArtistChecklistTemplate` / `useArtistFinancials` / `useArtistActivity`), the Firestore rules fragment with 13 rules-unit tests, and the composite indexes needed by list-view queries.

**Architecture:** Single artist document per `/organizations/{orgId}/events/{eventId}/artists/{artistId}` per spec §4. Composables wrap vuefire's `useDocument` / `useCollection` (the existing pattern from `layers/core/app/composables/`). Rules slot into Plan B's compose-rules pipeline — a `layers/artists/firestore.rules.frag` is auto-discovered and concatenated into the root `firestore.rules` by `scripts/compose-rules.ts`. Tests run under Plan B's `vitest.config.rules.ts` against the live Firestore emulator. UI is out of scope for C1 (lands in C2).

**Tech Stack:** Nuxt 4, vuefire (`useFirestore` / `useCurrentUser` / `useDocument` / `useCollection`), Firebase JS SDK 12+, `@firebase/rules-unit-testing` 5.x, Vitest 2.x, Firebase Emulator Suite, TypeScript, pnpm.

**Spec:** [docs/superpowers/specs/2026-05-08-artist-management-module-design.md](../specs/2026-05-08-artist-management-module-design.md)

**Prerequisites (already shipped on `main`):**
- Plan A: core layer with `useOrg` / `useEvent` / `useEvents` / `useLocations` / etc., emulator dev workflow.
- Plan B: layered Firestore rule fragments, `scripts/compose-rules.ts`, `pnpm rules:check`, `vitest.config.rules.ts`, `layers/core/test/helpers/rules-env.ts`, `@firebase/rules-unit-testing` already a devDependency.
- SSR claims fix: `useFmgrClaims` composable at `layers/core/app/composables/useFmgrClaims.ts`, `event.context.fmgrClaims` typed via `layers/core/shared/types/h3.d.ts`.

**Out of scope for C1 (will land in later plans):**
- C2: artist list page, detail page, kanban view.
- C3: per-event checklist template settings page; per-org categories editor.
- C4: sample artists seed; manual end-to-end smoke check.
- All deferred items from spec §11.

---

## File Structure (created or modified in this plan)

```
festivalmgr/
├── firestore.indexes.json                                                  [MODIFY: 3 indexes added]
├── layers/
│   ├── core/
│   │   ├── shared/types/
│   │   │   ├── organization.ts                                             [MODIFY: + artistCategories?]
│   │   │   ├── event.ts                                                    [MODIFY: + artistChecklistTemplate?, ChecklistItemConfig]
│   │   │   ├── checklist.ts                                                [NEW: ChecklistItemConfig + helpers]
│   │   │   └── index.ts                                                    [MODIFY: re-export checklist]
│   │   └── shared/lib/
│   │       └── default-checklist.ts                                        [NEW: defaultArtistChecklistTemplate()]
│   └── artists/
│       ├── nuxt.config.ts                                                  [NEW: empty layer config]
│       ├── firestore.rules.frag                                            [NEW: artist + activity rules + validators]
│       ├── shared/types/
│       │   ├── artist.ts                                                   [NEW: Artist, ArtistStatus, ActivityLogEntry]
│       │   ├── checklist.ts                                                [NEW: ChecklistEntry, ResourceLink]
│       │   └── index.ts                                                    [NEW: barrel]
│       ├── app/composables/
│       │   ├── useArtistList.ts                                            [NEW]
│       │   ├── useArtist.ts                                                [NEW]
│       │   ├── useArtistMutations.ts                                       [NEW]
│       │   ├── useArtistResources.ts                                       [NEW]
│       │   ├── useArtistChecklistTemplate.ts                               [NEW]
│       │   ├── useArtistFinancials.ts                                      [NEW]
│       │   └── useArtistActivity.ts                                        [NEW]
│       └── test/
│           └── firestore.rules.test.ts                                     [NEW: 13 rules-unit tests]
├── tests/
│   └── composables/
│       ├── useArtistList.test.ts                                           [NEW]
│       ├── useArtist.test.ts                                               [NEW]
│       ├── useArtistMutations.test.ts                                      [NEW]
│       ├── useArtistResources.test.ts                                      [NEW]
│       ├── useArtistChecklistTemplate.test.ts                              [NEW]
│       ├── useArtistFinancials.test.ts                                     [NEW]
│       └── useArtistActivity.test.ts                                       [NEW]
└── scripts/
    └── seed-emulator.ts                                                    [MODIFY: include defaultArtistChecklistTemplate on the seeded event]
```

**Schema decision (deviates slightly from spec):** `artistChecklistTemplate` and `artistCategories` are typed as **optional** (`?:`) in v1. The default-seed helper guarantees new events get the template; existing events without it remain valid (no rule change to `isValidEvent` required). This avoids a migration story for orgs already seeded by Plan A's `seed-director`. The spec's design intent is preserved — the field is *expected* to be present after seeding.

---

## Task 1: Extend core types with artist-module fields

**Files:**
- Modify: `layers/core/shared/types/organization.ts`
- Modify: `layers/core/shared/types/event.ts`
- Create: `layers/core/shared/types/checklist.ts`
- Modify: `layers/core/shared/types/index.ts`

- [ ] **Step 1: Add `artistCategories` to `Organization`**

Replace the contents of `layers/core/shared/types/organization.ts` with:

```ts
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
```

- [ ] **Step 2: Create `layers/core/shared/types/checklist.ts`**

```ts
/**
 * Per-event configurable checklist template. Authored on the Event doc;
 * per-artist state lives on each Artist's `checklist` map.
 *
 * `id` is stable and never reused — deleting an item leaves orphan state in
 * existing artist docs but the UI hides it (recoverable if the delete was a
 * mistake).
 */
export type ChecklistRequirement = { type: 'resource' }

export type ChecklistItemConfig = {
  id: string
  label: string
  description?: string
  order: number
  /** When set, only artists whose `category` is in this list see this item. */
  appliesToCategories?: string[]
  /** When set to `{ type: 'resource' }`, the item auto-satisfies once ≥1 resource is linked. */
  requirement?: ChecklistRequirement
}
```

- [ ] **Step 3: Add `artistChecklistTemplate` to `Event`**

Replace the contents of `layers/core/shared/types/event.ts` with:

```ts
import type { Timestamp } from 'firebase/firestore'
import type { ChecklistItemConfig } from './checklist'

export type Event = {
  name: string
  slug: string
  primaryLocale: string
  primaryContacts: string[]
  status: 'planning' | 'live' | 'archived'
  dates: { start: Timestamp; end: Timestamp }
  publicSlug?: string
  publishToPublic: boolean
  /**
   * Per-event advancing checklist template. Optional in v1 — `seed-emulator`
   * seeds it via `defaultArtistChecklistTemplate()`. Existing events without
   * the field are valid; the artist UI treats them as having an empty list.
   */
  artistChecklistTemplate?: ChecklistItemConfig[]
  createdAt: Timestamp
  deletedAt: Timestamp | null
}
```

- [ ] **Step 4: Re-export the new type from the barrel**

Read `layers/core/shared/types/index.ts` first to find the existing re-export shape, then append:

```ts
export * from './checklist'
```

- [ ] **Step 5: Verify types compile**

```bash
pnpm exec nuxt prepare && pnpm typecheck 2>&1 | tail -5
```

Expected: no errors. Confirms the new optional fields don't break existing consumers (`useEvent`, `useOrg`, `tests/composables/use*.test.ts`).

- [ ] **Step 6: Commit**

```bash
git add layers/core/shared/types/
git commit -m "feat(core): extend Org with artistCategories and Event with artistChecklistTemplate"
```

---

## Task 2: Default-checklist seed helper + integration into seed-emulator

**Files:**
- Create: `layers/core/shared/lib/default-checklist.ts`
- Modify: `layers/core/shared/types/index.ts`
- Modify: `scripts/seed-emulator.ts`

- [ ] **Step 1: Create `layers/core/shared/lib/default-checklist.ts`**

```ts
import type { ChecklistItemConfig } from '../types/checklist'

/**
 * Default starter checklist seeded on every new event. Items are ordered by
 * the `order` field so the UI doesn't need a separate sort step. IDs are
 * stable strings — never reused even if the label is rewritten — so per-artist
 * state survives template edits.
 */
export const defaultArtistChecklistTemplate = (): ChecklistItemConfig[] => [
  { id: 'promo-received',         label: 'Promo material received',     order: 10 },
  { id: 'tech-rider-received',    label: 'Tech rider received',         order: 20, requirement: { type: 'resource' } },
  { id: 'stage-plot-received',    label: 'Stage plot received',         order: 30, requirement: { type: 'resource' } },
  { id: 'contract-sent',          label: 'Contract sent',               order: 40 },
  { id: 'contract-signed',        label: 'Contract signed',             order: 50, requirement: { type: 'resource' } },
  { id: 'production-sheet',       label: 'Production sheet completed',  order: 60 },
  { id: 'hospitality-confirmed',  label: 'Hospitality info confirmed',  order: 70 },
  { id: 'travel-arranged',        label: 'Travel arranged',             order: 80 },
  { id: 'accommodation-arranged', label: 'Accommodation arranged',      order: 90 },
]
```

- [ ] **Step 2: Re-export from the types barrel**

Append to `layers/core/shared/types/index.ts`:

```ts
export { defaultArtistChecklistTemplate } from '../lib/default-checklist'
```

(The lib file lives outside `types/` but the existing convention re-exports helpers through the same barrel; module composables import from `#layers/core/shared/types`.)

- [ ] **Step 3: Read `scripts/seed-emulator.ts` and find where the event doc is written**

```bash
grep -n 'events\|Event\|seedDirector' scripts/seed-emulator.ts | head
```

The script seeds an event via `setDoc(...events/{eventId}, {...})`. Add the field to that payload.

- [ ] **Step 4: Modify `scripts/seed-emulator.ts` — include the default checklist on the seeded event**

Add the import at the top of the file (next to existing imports from `firebase-admin`):

```ts
import { defaultArtistChecklistTemplate } from '../layers/core/shared/lib/default-checklist'
```

Find the event-doc payload (an object with `name`, `slug`, `primaryLocale`, `dates`, etc.) and add:

```ts
artistChecklistTemplate: defaultArtistChecklistTemplate(),
```

- [ ] **Step 5: Run `pnpm dev:seed` against a running emulator and verify the event has the field**

In one terminal:
```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home
export PATH=$JAVA_HOME/bin:$PATH
pnpm dev
```

Wait for `[wait-for-emulators] hub reports: auth, firestore, functions, storage`.

In a second terminal:
```bash
pnpm dev:seed
```

Expected stdout: `Seeded emulator: org=lila, director=director@example.com, event=lila-2025, 2 locations.`

Verify the field landed:
```bash
curl -fsS 'http://127.0.0.1:8080/v1/projects/demo-festivalmgr-dev/databases/(default)/documents/organizations/lila/events/lila-2025' | python3 -c 'import sys,json; d=json.load(sys.stdin); fields=d.get("fields",{}); print("has template:", "artistChecklistTemplate" in fields, "items:", len(fields.get("artistChecklistTemplate",{}).get("arrayValue",{}).get("values",[])))'
```

Expected: `has template: True items: 9`.

Stop the dev terminals.

- [ ] **Step 6: Commit**

```bash
git add layers/core/shared/lib/default-checklist.ts layers/core/shared/types/index.ts scripts/seed-emulator.ts
git commit -m "feat(core): seed defaultArtistChecklistTemplate onto new events"
```

---

## Task 3: Scaffold `layers/artists/` skeleton

**Files:**
- Create: `layers/artists/nuxt.config.ts`
- Create: `layers/artists/shared/types/index.ts` (placeholder for now; fleshed out in Task 4)

- [ ] **Step 1: Create `layers/artists/nuxt.config.ts`**

```ts
export default defineNuxtConfig({})
```

Nuxt 4 auto-discovers `layers/<name>/` directories — no root `nuxt.config.ts` modification required (verified during Plan A).

- [ ] **Step 2: Create `layers/artists/shared/types/index.ts` placeholder**

```ts
// Placeholder — filled in Task 4.
export {}
```

- [ ] **Step 3: Verify Nuxt picks up the new layer**

```bash
pnpm exec nuxt prepare 2>&1 | tail -5
grep -c '#layers/artists' .nuxt/types/imports.d.ts || true
```

Expected: nuxt prepare completes without errors. `#layers/artists` alias should be generated by Nuxt (Plan A's `#layers/core` alias is set up the same way).

- [ ] **Step 4: Commit**

```bash
git add layers/artists/
git commit -m "feat(artists): scaffold artists layer"
```

---

## Task 4: Artist domain types

**Files:**
- Create: `layers/artists/shared/types/checklist.ts`
- Create: `layers/artists/shared/types/artist.ts`
- Modify: `layers/artists/shared/types/index.ts`

- [ ] **Step 1: Write `layers/artists/shared/types/checklist.ts`**

```ts
import type { Timestamp } from 'firebase/firestore'

/**
 * Drive link (or other URL) attached to a checklist item. Storage uploads
 * are deferred to a later spec — v1 is link-only.
 */
export type ResourceLink = {
  url: string
  title?: string
  /** UI hint; user-set or inferred from URL pattern. */
  kind?: 'file' | 'folder'
  addedBy: string
  addedAt: Timestamp
}

/**
 * Per-artist state for one checklist template item. Keys reference
 * `Event.artistChecklistTemplate[].id`.
 */
export type ChecklistEntry = {
  /** Manual checkbox value, OR computed `true` when `requirement` is satisfied. */
  done: boolean
  /** True when a `requirement` (e.g. `{type:'resource'}`) is currently met. */
  autoSatisfied?: boolean
  doneAt?: Timestamp
  /** uid; null when auto-satisfied without a manual user click. */
  doneBy?: string
  /** Populated when the template item has `requirement.type === 'resource'`. */
  resources?: ResourceLink[]
  note?: string
}
```

- [ ] **Step 2: Write `layers/artists/shared/types/artist.ts`**

```ts
import type { Timestamp } from 'firebase/firestore'
import type { ChecklistEntry } from './checklist'

export type ArtistStatus =
  | 'planned'    // geplant — in the system, inquiry not yet sent
  | 'inquired'   // angefragt — initial offer email sent, awaiting reply
  | 'confirmed'  // bestätigt — deal locked
  | 'declined'   // they said no (terminal)
  | 'cancelled'  // confirmed but later cancelled (terminal)

export type Artist = {
  // ── Identity ───────────────────────────────────────────────────────
  name: string
  category: string
  links: {
    website?: string
    instagram?: string
    other?: { label: string; url: string }[]
  }
  origin?: string
  shortDescription?: string

  // ── Booking ────────────────────────────────────────────────────────
  status: ArtistStatus
  statusChangedAt: Timestamp
  primaryContact?: { name?: string; email?: string; role?: string; note?: string }
  responsibleUserId?: string

  // ── Deal terms ─────────────────────────────────────────────────────
  fee?: { amount: number; currency: string }
  travelBudget?: { amount: number; currency: string }
  accommodation?: string
  daysPresent?: number
  dealNotes?: string

  // ── Performance metadata (intent — actual slot owned by Schedule) ──
  intendedDay?: string                         // ISO date, e.g. "2025-09-05"
  intendedLocationId?: string
  performanceDurationMin?: number
  performanceNote?: string

  // ── Advancing checklist state ──────────────────────────────────────
  /** Keys reference `Event.artistChecklistTemplate[].id`. */
  checklist: { [itemId: string]: ChecklistEntry }

  // ── Generic / forward-compat ───────────────────────────────────────
  comment?: string
  customAttributes?: { [key: string]: unknown }

  // ── Lifecycle ──────────────────────────────────────────────────────
  createdAt: Timestamp
  createdBy: string
  updatedAt: Timestamp
  updatedBy: string
  deletedAt: Timestamp | null
}

/**
 * Append-only audit subcollection. One row per field change, written
 * by the mutation composables.
 */
export type ActivityLogEntry = {
  uid: string
  at: Timestamp
  /** Dot-path, e.g. `"status"` or `"fee.amount"`. */
  field: string
  before: unknown
  after: unknown
}
```

- [ ] **Step 3: Replace `layers/artists/shared/types/index.ts` with a barrel**

```ts
export * from './artist'
export * from './checklist'
```

- [ ] **Step 4: Verify types compile**

```bash
pnpm exec nuxt prepare && pnpm typecheck 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add layers/artists/shared/types/
git commit -m "feat(artists): add Artist + ChecklistEntry + ResourceLink + ActivityLogEntry types"
```

---

## Task 5: `useArtistList` composable + tests

**Files:**
- Create: `layers/artists/app/composables/useArtistList.ts`
- Create: `tests/composables/useArtistList.test.ts`

The list composable returns a realtime ref of artists for an event, scoped by `deletedAt == null` and optional status / category / responsibleUserId filters.

- [ ] **Step 1: Write the failing test**

Create `tests/composables/useArtistList.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'

const collectionMock = vi.fn((..._args: unknown[]) => ({ path: 'organizations/lila/events/lila-2025/artists' }))
const queryMock      = vi.fn((..._args: unknown[]) => ({ kind: 'q', args: _args }))
const whereMock      = vi.fn((field: string, op: string, value: unknown) => ({ where: { field, op, value } }))
const orderByMock    = vi.fn((field: string, dir?: string) => ({ orderBy: { field, dir } }))

vi.mock('firebase/firestore', () => ({
  collection: (...a: unknown[]) => collectionMock(...a),
  query:      (...a: unknown[]) => queryMock(...a),
  where:      (...a: unknown[]) => whereMock(a[0] as string, a[1] as string, a[2]),
  orderBy:    (...a: unknown[]) => orderByMock(a[0] as string, a[1] as string | undefined),
}))
vi.mock('vuefire', () => ({
  useFirestore: () => ({}),
  useCollection: vi.fn(() => ref([
    { id: 'a1', name: 'ARXX', status: 'confirmed', deletedAt: null },
  ])),
}))

import { useArtistList } from '#layers/artists/app/composables/useArtistList'

describe('useArtistList', () => {
  it('builds a query scoped to the org/event with deletedAt filter', () => {
    const list = useArtistList('lila', 'lila-2025')
    expect(collectionMock).toHaveBeenCalledWith({}, 'organizations', 'lila', 'events', 'lila-2025', 'artists')
    expect(whereMock).toHaveBeenCalledWith('deletedAt', '==', null)
    expect(list.value).toHaveLength(1)
  })

  it('adds status filter when provided', () => {
    useArtistList('lila', 'lila-2025', { status: ['planned', 'inquired'] })
    expect(whereMock).toHaveBeenCalledWith('status', 'in', ['planned', 'inquired'])
  })

  it('adds responsibleUserId filter when provided', () => {
    useArtistList('lila', 'lila-2025', { responsibleUserId: 'u1' })
    expect(whereMock).toHaveBeenCalledWith('responsibleUserId', '==', 'u1')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test --reporter=verbose tests/composables/useArtistList.test.ts 2>&1 | tail -10
```

Expected: FAIL — `Cannot find module '#layers/artists/app/composables/useArtistList'`.

- [ ] **Step 3: Write the composable**

Create `layers/artists/app/composables/useArtistList.ts`:

```ts
import { useCollection, useFirestore } from 'vuefire'
import { collection, orderBy, query, where, type QueryConstraint } from 'firebase/firestore'
import type { Artist, ArtistStatus } from '#layers/artists/shared/types'

export type ArtistListFilter = {
  status?: ArtistStatus[]
  category?: string[]
  responsibleUserId?: string
}

/**
 * Realtime list of non-deleted artists for an event. Default sort:
 * statusChangedAt ascending (oldest waiting first), filtered by
 * `deletedAt == null`. Status / category / responsibleUserId filters
 * are AND'd together.
 *
 * Note: when both `status` and `category` filters are present, Firestore
 * requires a composite index — see Task 13.
 */
export function useArtistList(
  orgId: string,
  eventId: string,
  filter: ArtistListFilter = {},
) {
  const db = useFirestore()
  const constraints: QueryConstraint[] = [where('deletedAt', '==', null)]
  if (filter.status && filter.status.length > 0) {
    constraints.push(where('status', 'in', filter.status))
  }
  if (filter.category && filter.category.length > 0) {
    constraints.push(where('category', 'in', filter.category))
  }
  if (filter.responsibleUserId) {
    constraints.push(where('responsibleUserId', '==', filter.responsibleUserId))
  }
  constraints.push(orderBy('statusChangedAt', 'asc'))
  const ref = collection(db, 'organizations', orgId, 'events', eventId, 'artists')
  return useCollection<Artist>(query(ref, ...constraints))
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test --reporter=verbose tests/composables/useArtistList.test.ts 2>&1 | tail -10
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add layers/artists/app/composables/useArtistList.ts tests/composables/useArtistList.test.ts
git commit -m "feat(artists): add useArtistList composable + tests"
```

---

## Task 6: `useArtist` composable + tests

**Files:**
- Create: `layers/artists/app/composables/useArtist.ts`
- Create: `tests/composables/useArtist.test.ts`

Single-doc realtime read.

- [ ] **Step 1: Write the failing test**

Create `tests/composables/useArtist.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'

const docMock = vi.fn((..._args: unknown[]) => ({ path: 'organizations/lila/events/lila-2025/artists/a1' }))

vi.mock('firebase/firestore', () => ({
  doc: (...a: unknown[]) => docMock(...a),
}))
vi.mock('vuefire', () => ({
  useFirestore: () => ({}),
  useDocument: vi.fn(() => ref({
    name: 'ARXX', status: 'confirmed', category: 'Musikact', deletedAt: null,
  })),
}))

import { useArtist } from '#layers/artists/app/composables/useArtist'

describe('useArtist', () => {
  it('builds a doc ref to the right path and returns the live document', () => {
    const artist = useArtist('lila', 'lila-2025', 'a1')
    expect(docMock).toHaveBeenCalledWith({}, 'organizations', 'lila', 'events', 'lila-2025', 'artists', 'a1')
    expect(artist.value?.name).toBe('ARXX')
  })
})
```

- [ ] **Step 2: Run, expect failure**

```bash
pnpm test --reporter=verbose tests/composables/useArtist.test.ts 2>&1 | tail -5
```

- [ ] **Step 3: Write the composable**

```ts
// layers/artists/app/composables/useArtist.ts
import { useDocument, useFirestore } from 'vuefire'
import { doc } from 'firebase/firestore'
import type { Artist } from '#layers/artists/shared/types'

/**
 * Realtime single-document subscription. Returns vuefire's `Ref<Artist | null>`
 * — null while the doc loads or if it doesn't exist.
 */
export function useArtist(orgId: string, eventId: string, artistId: string) {
  const db = useFirestore()
  return useDocument<Artist>(
    doc(db, 'organizations', orgId, 'events', eventId, 'artists', artistId),
  )
}
```

- [ ] **Step 4: Run, expect pass**

```bash
pnpm test --reporter=verbose tests/composables/useArtist.test.ts 2>&1 | tail -5
```

Expected: 1 passed.

- [ ] **Step 5: Commit**

```bash
git add layers/artists/app/composables/useArtist.ts tests/composables/useArtist.test.ts
git commit -m "feat(artists): add useArtist single-doc composable + tests"
```

---

## Task 7: `useArtistMutations` composable + tests

**Files:**
- Create: `layers/artists/app/composables/useArtistMutations.ts`
- Create: `tests/composables/useArtistMutations.test.ts`

`createArtist` / `updateArtist` / `softDeleteArtist` / `transitionStatus`. Each mutation also writes one entry to `artists/{id}/activity/{logId}` per spec §5.

- [ ] **Step 1: Write the failing test**

Create `tests/composables/useArtistMutations.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'

const addDocMock      = vi.fn(async () => ({ id: 'newid' }))
const setDocMock      = vi.fn(async () => undefined)
const updateDocMock   = vi.fn(async () => undefined)
const collectionMock  = vi.fn((..._a: unknown[]) => ({ kind: 'collection' }))
const docMock         = vi.fn((..._a: unknown[]) => ({ kind: 'doc' }))
const tsMock          = vi.fn(() => ({ kind: 'ts', _isMock: true }))

vi.mock('firebase/firestore', () => ({
  addDoc: (...a: unknown[]) => addDocMock(...a as [unknown, unknown]),
  setDoc: (...a: unknown[]) => setDocMock(...a as [unknown, unknown]),
  updateDoc: (...a: unknown[]) => updateDocMock(...a as [unknown, unknown]),
  collection: (...a: unknown[]) => collectionMock(...a),
  doc: (...a: unknown[]) => docMock(...a),
  serverTimestamp: () => tsMock(),
  Timestamp: { now: () => ({ kind: 'ts', _isMock: true }) },
}))
vi.mock('vuefire', () => ({
  useFirestore: () => ({}),
  useCurrentUser: () => ref({ uid: 'u1' }),
}))

import { useArtistMutations } from '#layers/artists/app/composables/useArtistMutations'

describe('useArtistMutations', () => {
  beforeEach(() => {
    addDocMock.mockClear(); setDocMock.mockClear(); updateDocMock.mockClear()
    collectionMock.mockClear(); docMock.mockClear()
  })

  it('createArtist writes a doc with createdBy/updatedBy = current user', async () => {
    const m = useArtistMutations('lila', 'lila-2025')
    await m.createArtist({ name: 'NewAct', category: 'Musikact' })
    expect(addDocMock).toHaveBeenCalledTimes(1)
    const payload = addDocMock.mock.calls[0]![1] as Record<string, unknown>
    expect(payload).toMatchObject({
      name: 'NewAct',
      category: 'Musikact',
      status: 'planned',
      createdBy: 'u1',
      updatedBy: 'u1',
      deletedAt: null,
    })
    expect(payload.checklist).toEqual({})
  })

  it('updateArtist sets updatedAt + updatedBy and writes activity log entries for changed fields', async () => {
    const m = useArtistMutations('lila', 'lila-2025')
    await m.updateArtist('a1', { fee: { amount: 500, currency: 'CHF' } }, { fee: { amount: 400, currency: 'CHF' } })
    expect(updateDocMock).toHaveBeenCalledTimes(1)
    expect(addDocMock).toHaveBeenCalledTimes(1)  // activity log entry
    const activityArgs = addDocMock.mock.calls[0]![1] as Record<string, unknown>
    expect(activityArgs).toMatchObject({ uid: 'u1', field: 'fee', before: { amount: 400, currency: 'CHF' }, after: { amount: 500, currency: 'CHF' } })
  })

  it('softDeleteArtist sets deletedAt, not removes', async () => {
    const m = useArtistMutations('lila', 'lila-2025')
    await m.softDeleteArtist('a1')
    expect(updateDocMock).toHaveBeenCalledTimes(1)
    const payload = updateDocMock.mock.calls[0]![1] as Record<string, unknown>
    expect(payload.deletedAt).toBeTruthy()
    expect(payload.updatedBy).toBe('u1')
  })

  it('transitionStatus updates status + statusChangedAt and logs activity', async () => {
    const m = useArtistMutations('lila', 'lila-2025')
    await m.transitionStatus('a1', 'inquired', 'planned')
    expect(updateDocMock).toHaveBeenCalledTimes(1)
    const payload = updateDocMock.mock.calls[0]![1] as Record<string, unknown>
    expect(payload).toMatchObject({ status: 'inquired', updatedBy: 'u1' })
    expect(payload.statusChangedAt).toBeTruthy()
    expect(addDocMock).toHaveBeenCalledTimes(1)
    const activityArgs = addDocMock.mock.calls[0]![1] as Record<string, unknown>
    expect(activityArgs).toMatchObject({ field: 'status', before: 'planned', after: 'inquired' })
  })
})
```

- [ ] **Step 2: Run, expect failure**

```bash
pnpm test --reporter=verbose tests/composables/useArtistMutations.test.ts 2>&1 | tail -10
```

- [ ] **Step 3: Write the composable**

```ts
// layers/artists/app/composables/useArtistMutations.ts
import { useCurrentUser, useFirestore } from 'vuefire'
import {
  addDoc, collection, doc, serverTimestamp, setDoc, Timestamp, updateDoc,
} from 'firebase/firestore'
import type { Artist, ArtistStatus } from '#layers/artists/shared/types'

type ArtistCreateInput = {
  name: string
  category: string
} & Partial<Pick<Artist,
  | 'links'
  | 'origin'
  | 'shortDescription'
  | 'primaryContact'
  | 'responsibleUserId'
  | 'fee'
  | 'travelBudget'
  | 'accommodation'
  | 'daysPresent'
  | 'dealNotes'
  | 'intendedDay'
  | 'intendedLocationId'
  | 'performanceDurationMin'
  | 'performanceNote'
  | 'comment'
  | 'customAttributes'
>>

/**
 * Mutations for an artist collection. Every write also appends one entry
 * to /artists/{id}/activity/ for each changed field — the activity log is
 * the source-of-truth for the detail page's "Activity" panel.
 */
export function useArtistMutations(orgId: string, eventId: string) {
  const db = useFirestore()
  const user = useCurrentUser()
  const uid = () => user.value?.uid ?? 'anonymous'

  const artistsRef = collection(db, 'organizations', orgId, 'events', eventId, 'artists')

  async function logActivity(
    artistId: string,
    entries: Array<{ field: string; before: unknown; after: unknown }>,
  ) {
    const activityRef = collection(artistsRef, artistId, 'activity')
    for (const e of entries) {
      await addDoc(activityRef, {
        uid: uid(),
        at: serverTimestamp(),
        field: e.field,
        before: e.before,
        after: e.after,
      })
    }
  }

  async function createArtist(input: ArtistCreateInput) {
    const now = serverTimestamp()
    const payload = {
      ...input,
      links: input.links ?? {},
      status: 'planned' as ArtistStatus,
      statusChangedAt: Timestamp.now(),
      checklist: {},
      createdAt: now,
      createdBy: uid(),
      updatedAt: now,
      updatedBy: uid(),
      deletedAt: null,
      // responsibleUserId defaults to creator if not provided — matches
      // the "Add artist" UX in the spec §9a.
      responsibleUserId: input.responsibleUserId ?? uid(),
    }
    return addDoc(artistsRef, payload)
  }

  async function updateArtist(
    artistId: string,
    patch: Partial<Artist>,
    /** Pass the previous values so the activity log can record before/after. */
    before: Partial<Artist> = {},
  ) {
    const ref = doc(artistsRef, artistId)
    await updateDoc(ref, {
      ...patch,
      updatedAt: serverTimestamp(),
      updatedBy: uid(),
    })
    const entries = Object.keys(patch).map((field) => ({
      field,
      before: (before as Record<string, unknown>)[field],
      after: (patch as Record<string, unknown>)[field],
    }))
    await logActivity(artistId, entries)
  }

  async function softDeleteArtist(artistId: string) {
    const ref = doc(artistsRef, artistId)
    await updateDoc(ref, {
      deletedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedBy: uid(),
    })
  }

  async function transitionStatus(
    artistId: string,
    next: ArtistStatus,
    previous: ArtistStatus,
  ) {
    const ref = doc(artistsRef, artistId)
    await updateDoc(ref, {
      status: next,
      statusChangedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedBy: uid(),
    })
    await logActivity(artistId, [{ field: 'status', before: previous, after: next }])
  }

  return { createArtist, updateArtist, softDeleteArtist, transitionStatus }
}
```

- [ ] **Step 4: Run, expect pass**

```bash
pnpm test --reporter=verbose tests/composables/useArtistMutations.test.ts 2>&1 | tail -5
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add layers/artists/app/composables/useArtistMutations.ts tests/composables/useArtistMutations.test.ts
git commit -m "feat(artists): add useArtistMutations + activity logging"
```

---

## Task 8: `useArtistResources` composable + tests

**Files:**
- Create: `layers/artists/app/composables/useArtistResources.ts`
- Create: `tests/composables/useArtistResources.test.ts`

Adds / removes `ResourceLink` entries inside a specific checklist item's `resources` array. Auto-flips the entry's `done` flag based on resource count when the template item has `requirement.type === 'resource'` (the composable doesn't know the template — it just maintains the resource array; auto-satisfaction is computed in `useArtistChecklistTemplate` via the requirement check).

- [ ] **Step 1: Write the failing test**

Create `tests/composables/useArtistResources.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'

const updateDocMock = vi.fn(async () => undefined)
const docMock       = vi.fn((..._a: unknown[]) => ({ kind: 'doc' }))

vi.mock('firebase/firestore', () => ({
  doc: (...a: unknown[]) => docMock(...a),
  updateDoc: (...a: unknown[]) => updateDocMock(...a as [unknown, unknown]),
  serverTimestamp: () => ({ _ts: true }),
  Timestamp: { now: () => ({ _ts: true }) },
}))
vi.mock('vuefire', () => ({
  useFirestore: () => ({}),
  useCurrentUser: () => ref({ uid: 'u1' }),
}))

import { useArtistResources } from '#layers/artists/app/composables/useArtistResources'

describe('useArtistResources', () => {
  beforeEach(() => {
    updateDocMock.mockClear()
  })

  it('addResource appends to checklist[itemId].resources via field-path update', async () => {
    const r = useArtistResources('lila', 'lila-2025', 'a1')
    await r.addResource('tech-rider-received', { url: 'https://drive.google.com/file/abc' }, [])
    expect(updateDocMock).toHaveBeenCalledTimes(1)
    const patch = updateDocMock.mock.calls[0]![1] as Record<string, unknown>
    const newList = patch['checklist.tech-rider-received.resources'] as Array<Record<string, unknown>>
    expect(newList).toHaveLength(1)
    expect(newList[0]).toMatchObject({ url: 'https://drive.google.com/file/abc', addedBy: 'u1' })
  })

  it('addResource preserves existing resources and infers folder kind', async () => {
    const r = useArtistResources('lila', 'lila-2025', 'a1')
    await r.addResource('tech-rider-received', { url: 'https://drive.google.com/drive/folders/X' },
      [{ url: 'old', addedBy: 'u0', addedAt: { _ts: true } as never }])
    const patch = updateDocMock.mock.calls[0]![1] as Record<string, unknown>
    const newList = patch['checklist.tech-rider-received.resources'] as Array<Record<string, unknown>>
    expect(newList).toHaveLength(2)
    expect(newList[1]!.kind).toBe('folder')
  })

  it('removeResource splices the matching url out', async () => {
    const r = useArtistResources('lila', 'lila-2025', 'a1')
    await r.removeResource('tech-rider-received', 'https://drive.google.com/file/abc',
      [
        { url: 'https://drive.google.com/file/abc', addedBy: 'u1', addedAt: { _ts: true } as never },
        { url: 'https://drive.google.com/file/keep', addedBy: 'u1', addedAt: { _ts: true } as never },
      ])
    const patch = updateDocMock.mock.calls[0]![1] as Record<string, unknown>
    const newList = patch['checklist.tech-rider-received.resources'] as Array<Record<string, unknown>>
    expect(newList).toHaveLength(1)
    expect(newList[0]!.url).toBe('https://drive.google.com/file/keep')
  })
})
```

- [ ] **Step 2: Run, expect failure**

```bash
pnpm test --reporter=verbose tests/composables/useArtistResources.test.ts 2>&1 | tail -5
```

- [ ] **Step 3: Write the composable**

```ts
// layers/artists/app/composables/useArtistResources.ts
import { useCurrentUser, useFirestore } from 'vuefire'
import { doc, serverTimestamp, Timestamp, updateDoc } from 'firebase/firestore'
import type { ResourceLink } from '#layers/artists/shared/types'

function inferKind(url: string): 'file' | 'folder' | undefined {
  if (/drive\.google\.com\/drive\/folders\//.test(url)) return 'folder'
  if (/drive\.google\.com\/file\//.test(url)) return 'file'
  return undefined
}

/**
 * Add / remove resource links on a specific checklist item.
 *
 * Caller passes the CURRENT resources array from the artist doc; we
 * compute the new array and write it via a field-path update. This avoids
 * the read-then-write race that an arrayUnion-on-an-array-of-objects
 * approach would hit (Firestore arrayUnion compares by deep-equality, so
 * `addedAt: serverTimestamp()` would defeat dedup).
 */
export function useArtistResources(orgId: string, eventId: string, artistId: string) {
  const db = useFirestore()
  const user = useCurrentUser()
  const ref = doc(db, 'organizations', orgId, 'events', eventId, 'artists', artistId)

  async function addResource(
    itemId: string,
    input: { url: string; title?: string; kind?: 'file' | 'folder' },
    currentResources: ResourceLink[],
  ) {
    const next: ResourceLink = {
      url: input.url,
      title: input.title,
      kind: input.kind ?? inferKind(input.url),
      addedBy: user.value?.uid ?? 'anonymous',
      addedAt: Timestamp.now(),
    }
    const newList = [...currentResources, next]
    await updateDoc(ref, {
      [`checklist.${itemId}.resources`]: newList,
      updatedAt: serverTimestamp(),
      updatedBy: user.value?.uid ?? 'anonymous',
    })
  }

  async function removeResource(
    itemId: string,
    url: string,
    currentResources: ResourceLink[],
  ) {
    const newList = currentResources.filter((r) => r.url !== url)
    await updateDoc(ref, {
      [`checklist.${itemId}.resources`]: newList,
      updatedAt: serverTimestamp(),
      updatedBy: user.value?.uid ?? 'anonymous',
    })
  }

  return { addResource, removeResource }
}
```

- [ ] **Step 4: Run, expect pass**

```bash
pnpm test --reporter=verbose tests/composables/useArtistResources.test.ts 2>&1 | tail -5
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add layers/artists/app/composables/useArtistResources.ts tests/composables/useArtistResources.test.ts
git commit -m "feat(artists): add useArtistResources composable + tests"
```

---

## Task 9: `useArtistChecklistTemplate` composable + tests

**Files:**
- Create: `layers/artists/app/composables/useArtistChecklistTemplate.ts`
- Create: `tests/composables/useArtistChecklistTemplate.test.ts`

Reads `event.artistChecklistTemplate` and exposes a function that, given an `Artist`, returns the visible items + their evaluated `done`/`autoSatisfied` state.

- [ ] **Step 1: Write the failing test**

Create `tests/composables/useArtistChecklistTemplate.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'

const docMock = vi.fn((..._a: unknown[]) => ({ kind: 'doc' }))

vi.mock('firebase/firestore', () => ({
  doc: (...a: unknown[]) => docMock(...a),
}))
vi.mock('vuefire', () => ({
  useFirestore: () => ({}),
  useDocument: vi.fn(() => ref({
    artistChecklistTemplate: [
      { id: 'promo-received',      label: 'Promo material received',     order: 10 },
      { id: 'tech-rider-received', label: 'Tech rider received',         order: 20, requirement: { type: 'resource' } },
      { id: 'visa',                label: 'Visa arranged',               order: 30, appliesToCategories: ['Theater'] },
    ],
  })),
}))

import { useArtistChecklistTemplate } from '#layers/artists/app/composables/useArtistChecklistTemplate'

describe('useArtistChecklistTemplate', () => {
  it('returns the template items in order', () => {
    const t = useArtistChecklistTemplate('lila', 'lila-2025')
    expect(t.items.value!.map((i) => i.id)).toEqual(['promo-received', 'tech-rider-received', 'visa'])
  })

  it('evaluateForArtist filters items whose appliesToCategories excludes the artist', () => {
    const t = useArtistChecklistTemplate('lila', 'lila-2025')
    const artist = { category: 'Musikact', checklist: {} } as never
    const items = t.evaluateForArtist(artist)
    expect(items.map((i) => i.id)).toEqual(['promo-received', 'tech-rider-received'])
  })

  it('evaluateForArtist auto-satisfies a resource-requirement item when ≥1 resource is linked', () => {
    const t = useArtistChecklistTemplate('lila', 'lila-2025')
    const artist = {
      category: 'Musikact',
      checklist: {
        'tech-rider-received': {
          done: false,
          resources: [{ url: 'https://x', addedBy: 'u1', addedAt: 'ts' }],
        },
      },
    } as never
    const item = t.evaluateForArtist(artist).find((i) => i.id === 'tech-rider-received')!
    expect(item.done).toBe(true)
    expect(item.autoSatisfied).toBe(true)
  })

  it('evaluateForArtist leaves a resource-requirement item undone when no resource is linked', () => {
    const t = useArtistChecklistTemplate('lila', 'lila-2025')
    const artist = { category: 'Musikact', checklist: {} } as never
    const item = t.evaluateForArtist(artist).find((i) => i.id === 'tech-rider-received')!
    expect(item.done).toBe(false)
  })

  it('evaluateForArtist respects manual `done` for items without a requirement', () => {
    const t = useArtistChecklistTemplate('lila', 'lila-2025')
    const artist = {
      category: 'Musikact',
      checklist: { 'promo-received': { done: true } },
    } as never
    const item = t.evaluateForArtist(artist).find((i) => i.id === 'promo-received')!
    expect(item.done).toBe(true)
  })
})
```

- [ ] **Step 2: Run, expect failure**

```bash
pnpm test --reporter=verbose tests/composables/useArtistChecklistTemplate.test.ts 2>&1 | tail -5
```

- [ ] **Step 3: Write the composable**

```ts
// layers/artists/app/composables/useArtistChecklistTemplate.ts
import { computed } from 'vue'
import { useDocument, useFirestore } from 'vuefire'
import { doc } from 'firebase/firestore'
import type { ChecklistItemConfig, Event } from '#layers/core/shared/types'
import type { Artist, ChecklistEntry } from '#layers/artists/shared/types'

export type EvaluatedChecklistItem = ChecklistItemConfig & {
  done: boolean
  autoSatisfied?: boolean
  entry?: ChecklistEntry
}

/**
 * Reads the per-event checklist template + exposes a pure evaluator that
 * filters items by the artist's category and computes per-item `done`
 * (manual checkbox OR satisfied requirement).
 *
 * UI consumes `items` to render the settings page (ordered template) and
 * `evaluateForArtist(artist)` to render the artist's per-item state.
 */
export function useArtistChecklistTemplate(orgId: string, eventId: string) {
  const db = useFirestore()
  const event = useDocument<Event>(
    doc(db, 'organizations', orgId, 'events', eventId),
  )

  const items = computed(() => {
    const list = event.value?.artistChecklistTemplate ?? []
    return [...list].sort((a, b) => a.order - b.order)
  })

  function evaluateForArtist(artist: Pick<Artist, 'category' | 'checklist'>): EvaluatedChecklistItem[] {
    return items.value
      .filter((item) =>
        !item.appliesToCategories || item.appliesToCategories.includes(artist.category),
      )
      .map((item) => {
        const entry = artist.checklist?.[item.id]
        if (item.requirement?.type === 'resource') {
          const has = (entry?.resources?.length ?? 0) > 0
          return { ...item, entry, done: has, autoSatisfied: has }
        }
        return { ...item, entry, done: entry?.done ?? false }
      })
  }

  return { items, evaluateForArtist }
}
```

- [ ] **Step 4: Run, expect pass**

```bash
pnpm test --reporter=verbose tests/composables/useArtistChecklistTemplate.test.ts 2>&1 | tail -5
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add layers/artists/app/composables/useArtistChecklistTemplate.ts tests/composables/useArtistChecklistTemplate.test.ts
git commit -m "feat(artists): add useArtistChecklistTemplate + per-artist evaluator"
```

---

## Task 10: `useArtistFinancials` composable + tests

**Files:**
- Create: `layers/artists/app/composables/useArtistFinancials.ts`
- Create: `tests/composables/useArtistFinancials.test.ts`

Read-side rollup over `inquired` + `confirmed` artists per spec §7. Excludes `declined` / `cancelled` / soft-deleted.

- [ ] **Step 1: Write the failing test**

Create `tests/composables/useArtistFinancials.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'

vi.mock('firebase/firestore', () => ({
  collection: (..._a: unknown[]) => ({}),
  query: (..._a: unknown[]) => ({}),
  where: (..._a: unknown[]) => ({}),
}))
vi.mock('vuefire', () => ({
  useFirestore: () => ({}),
  useCollection: vi.fn(() => ref([
    { name: 'A', status: 'inquired',  category: 'Musikact', fee: { amount: 500, currency: 'CHF' }, travelBudget: { amount: 100, currency: 'CHF' } },
    { name: 'B', status: 'confirmed', category: 'Musikact', fee: { amount: 700, currency: 'CHF' }, travelBudget: { amount: 200, currency: 'EUR' } },
    { name: 'C', status: 'confirmed', category: 'Theater',  fee: { amount: 300, currency: 'CHF' } },
    { name: 'D', status: 'declined',  category: 'Musikact', fee: { amount: 999, currency: 'CHF' } },
  ])),
}))

import { useArtistFinancials } from '#layers/artists/app/composables/useArtistFinancials'

describe('useArtistFinancials', () => {
  it('totals fee + travelBudget over inquired+confirmed only', () => {
    const r = useArtistFinancials('lila', 'lila-2025')
    expect(r.totalFee.value).toBe(1500)        // 500 + 700 + 300, declined excluded
    expect(r.totalTravel.value).toBe(300)      // 100 + 200 (currencies are summed naively in v1)
  })

  it('groups fee totals by category', () => {
    const r = useArtistFinancials('lila', 'lila-2025')
    expect(r.feeByCategory.value).toEqual({ Musikact: 1200, Theater: 300 })
  })

  it('flags currency mismatches when an artist's currency differs from the org default', () => {
    const r = useArtistFinancials('lila', 'lila-2025', { defaultCurrency: 'CHF' })
    expect(r.mixedCurrencyArtists.value.map((a) => a.name)).toEqual(['B'])
  })
})
```

- [ ] **Step 2: Run, expect failure**

```bash
pnpm test --reporter=verbose tests/composables/useArtistFinancials.test.ts 2>&1 | tail -5
```

- [ ] **Step 3: Write the composable**

```ts
// layers/artists/app/composables/useArtistFinancials.ts
import { computed } from 'vue'
import { useCollection, useFirestore } from 'vuefire'
import { collection, query, where } from 'firebase/firestore'
import type { Artist } from '#layers/artists/shared/types'

/**
 * Read-side rollup: sums fees + travel budgets over artists that are
 * `inquired` or `confirmed` (declined/cancelled/soft-deleted excluded).
 *
 * v1 sums numeric amounts naively across currencies — Budget UI is
 * expected to surface mismatches via `mixedCurrencyArtists`.
 */
export function useArtistFinancials(
  orgId: string,
  eventId: string,
  options: { defaultCurrency?: string } = {},
) {
  const db = useFirestore()
  const ref = collection(db, 'organizations', orgId, 'events', eventId, 'artists')
  const artists = useCollection<Artist>(
    query(
      ref,
      where('deletedAt', '==', null),
      where('status', 'in', ['inquired', 'confirmed']),
    ),
  )

  const totalFee = computed(() =>
    artists.value.reduce((acc, a) => acc + (a.fee?.amount ?? 0), 0),
  )

  const totalTravel = computed(() =>
    artists.value.reduce((acc, a) => acc + (a.travelBudget?.amount ?? 0), 0),
  )

  const feeByCategory = computed(() => {
    const out: Record<string, number> = {}
    for (const a of artists.value) {
      const k = a.category
      out[k] = (out[k] ?? 0) + (a.fee?.amount ?? 0)
    }
    return out
  })

  const mixedCurrencyArtists = computed(() => {
    const def = options.defaultCurrency
    if (!def) return []
    return artists.value.filter((a) => {
      const fc = a.fee?.currency
      const tc = a.travelBudget?.currency
      return (fc && fc !== def) || (tc && tc !== def)
    })
  })

  return { artists, totalFee, totalTravel, feeByCategory, mixedCurrencyArtists }
}
```

- [ ] **Step 4: Run, expect pass**

```bash
pnpm test --reporter=verbose tests/composables/useArtistFinancials.test.ts 2>&1 | tail -5
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add layers/artists/app/composables/useArtistFinancials.ts tests/composables/useArtistFinancials.test.ts
git commit -m "feat(artists): add useArtistFinancials rollup composable"
```

---

## Task 11: `useArtistActivity` composable + tests

**Files:**
- Create: `layers/artists/app/composables/useArtistActivity.ts`
- Create: `tests/composables/useArtistActivity.test.ts`

Realtime read of the last N entries from the activity subcollection.

- [ ] **Step 1: Write the failing test**

Create `tests/composables/useArtistActivity.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'

const collectionMock = vi.fn((..._a: unknown[]) => ({}))
const queryMock      = vi.fn((..._a: unknown[]) => ({}))
const orderByMock    = vi.fn((field: string, dir: string) => ({ field, dir }))
const limitMock      = vi.fn((n: number) => ({ limit: n }))

vi.mock('firebase/firestore', () => ({
  collection: (...a: unknown[]) => collectionMock(...a),
  query:      (...a: unknown[]) => queryMock(...a),
  orderBy:    (...a: unknown[]) => orderByMock(a[0] as string, a[1] as string),
  limit:      (n: number) => limitMock(n),
}))
vi.mock('vuefire', () => ({
  useFirestore: () => ({}),
  useCollection: vi.fn(() => ref([
    { uid: 'u1', field: 'status', before: 'planned', after: 'inquired' },
  ])),
}))

import { useArtistActivity } from '#layers/artists/app/composables/useArtistActivity'

describe('useArtistActivity', () => {
  it('subscribes to /artists/{id}/activity ordered by `at desc`, default limit 20', () => {
    const log = useArtistActivity('lila', 'lila-2025', 'a1')
    expect(collectionMock).toHaveBeenCalledWith({}, 'organizations', 'lila', 'events', 'lila-2025', 'artists', 'a1', 'activity')
    expect(orderByMock).toHaveBeenCalledWith('at', 'desc')
    expect(limitMock).toHaveBeenCalledWith(20)
    expect(log.value).toHaveLength(1)
  })

  it('honors a custom limit', () => {
    useArtistActivity('lila', 'lila-2025', 'a1', { max: 5 })
    expect(limitMock).toHaveBeenCalledWith(5)
  })
})
```

- [ ] **Step 2: Run, expect failure**

```bash
pnpm test --reporter=verbose tests/composables/useArtistActivity.test.ts 2>&1 | tail -5
```

- [ ] **Step 3: Write the composable**

```ts
// layers/artists/app/composables/useArtistActivity.ts
import { useCollection, useFirestore } from 'vuefire'
import { collection, limit, orderBy, query } from 'firebase/firestore'
import type { ActivityLogEntry } from '#layers/artists/shared/types'

/**
 * Last N audit entries for an artist. Default 20 — matches the spec §9b
 * "Activity (last 20)" panel on the detail page.
 */
export function useArtistActivity(
  orgId: string,
  eventId: string,
  artistId: string,
  options: { max?: number } = {},
) {
  const db = useFirestore()
  const ref = collection(db, 'organizations', orgId, 'events', eventId, 'artists', artistId, 'activity')
  return useCollection<ActivityLogEntry>(
    query(ref, orderBy('at', 'desc'), limit(options.max ?? 20)),
  )
}
```

- [ ] **Step 4: Run, expect pass**

```bash
pnpm test --reporter=verbose tests/composables/useArtistActivity.test.ts 2>&1 | tail -5
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add layers/artists/app/composables/useArtistActivity.ts tests/composables/useArtistActivity.test.ts
git commit -m "feat(artists): add useArtistActivity composable"
```

---

## Task 12: Artist Firestore rules fragment + 13 rules-unit tests

**Files:**
- Create: `layers/artists/firestore.rules.frag`
- Create: `layers/artists/test/firestore.rules.test.ts`
- Regenerated: `firestore.rules`

The fragment slots into Plan B's compose pipeline — `scripts/compose-rules.ts` discovers `layers/artists/firestore.rules.frag` automatically and concatenates it into the root `firestore.rules` (after the `core` fragment, alphabetical order). Tests run under `vitest.config.rules.ts` against the live Firestore emulator via `firebase emulators:exec`.

- [ ] **Step 1: Create the fragment**

Create `layers/artists/firestore.rules.frag`:

```
function affectedFields() {
  return request.resource.data.diff(resource.data).affectedKeys();
}
function onlyFieldsChanged(allowed) {
  return affectedFields().hasOnly(allowed);
}
function isValidArtistOnCreate(d) {
  return d.name is string && d.name.size() > 0
      && d.category is string
      && d.status in ['planned','inquired','confirmed','declined','cancelled']
      && d.createdBy == request.auth.uid
      && d.deletedAt == null;
}
function isValidArtistOnUpdate(d) {
  return d.name is string && d.name.size() > 0
      && d.status in ['planned','inquired','confirmed','declined','cancelled']
      && d.updatedBy == request.auth.uid;
}

match /organizations/{orgId}/events/{eventId}/artists/{artistId} {
  allow read:   if inOrg(orgId)
                && hasRole(['director','booker','production','finance','pr','crew'])
                && resource.data.deletedAt == null;

  allow create: if inOrg(orgId)
                && hasRole(['director','booker'])
                && isValidArtistOnCreate(request.resource.data);

  allow update: if inOrg(orgId)
                && resource.data.deletedAt == null
                && (
                  (hasRole(['director','booker'])
                    && isValidArtistOnUpdate(request.resource.data))
                  || (hasRole(['production'])
                      && onlyFieldsChanged(['intendedDay','intendedLocationId',
                                            'performanceDurationMin','performanceNote',
                                            'checklist','comment','updatedAt','updatedBy']))
                  || (hasRole(['pr'])
                      && onlyFieldsChanged(['shortDescription','links',
                                            'updatedAt','updatedBy']))
                );

  allow delete: if inOrg(orgId) && hasRole(['director']);

  match /activity/{logId} {
    allow read:   if inOrg(orgId);
    allow create: if inOrg(orgId) && request.resource.data.uid == request.auth.uid;
    allow update, delete: if false;
  }
}
```

- [ ] **Step 2: Create `layers/artists/test/firestore.rules.test.ts`**

Tests follow the spec §10 table 1–13. They use Plan B's test env helpers (`getEnv` / `actingAs` / `actingAsAnon` / `seedAsAdmin` from `layers/core/test/helpers/rules-env`):

```ts
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import {
  addDoc, collection, deleteDoc, doc, getDoc, setDoc, updateDoc, Timestamp,
} from 'firebase/firestore'
import {
  actingAs, actingAsAnon, getEnv, seedAsAdmin, type TestUser,
} from '../../core/test/helpers/rules-env'

let env: RulesTestEnvironment

beforeAll(async () => { env = await getEnv() })
afterAll(async () => { await env.cleanup() })
beforeEach(async () => { await env.clearFirestore() })

const ORG_A = 'lila'
const ORG_B = 'other'
const EVENT_A = 'lila-2025'

const DIRECTOR_A:   TestUser = { uid: 'dirA',  orgId: ORG_A, role: 'director',   orgs: { [ORG_A]: 'director' } }
const BOOKER_A:     TestUser = { uid: 'bokA',  orgId: ORG_A, role: 'booker',     orgs: { [ORG_A]: 'booker' } }
const PROD_A:       TestUser = { uid: 'prdA',  orgId: ORG_A, role: 'production', orgs: { [ORG_A]: 'production' } }
const FIN_A:        TestUser = { uid: 'finA',  orgId: ORG_A, role: 'finance',    orgs: { [ORG_A]: 'finance' } }
const PR_A:         TestUser = { uid: 'prA',   orgId: ORG_A, role: 'pr',         orgs: { [ORG_A]: 'pr' } }
const CREW_A:       TestUser = { uid: 'crwA',  orgId: ORG_A, role: 'crew',       orgs: { [ORG_A]: 'crew' } }
const BOOKER_B:     TestUser = { uid: 'bokB',  orgId: ORG_B, role: 'booker',     orgs: { [ORG_B]: 'booker' } }

function artistFixture(overrides: Record<string, unknown> = {}) {
  return {
    name: 'NewAct',
    category: 'Musikact',
    links: {},
    status: 'planned',
    statusChangedAt: Timestamp.now(),
    checklist: {},
    createdAt: Timestamp.now(),
    createdBy: BOOKER_A.uid,
    updatedAt: Timestamp.now(),
    updatedBy: BOOKER_A.uid,
    deletedAt: null,
    ...overrides,
  }
}

async function seedExistingArtist(orgId: string, eventId: string, artistId: string, overrides: Record<string, unknown> = {}) {
  await seedAsAdmin(env, async (ctx) => {
    await setDoc(
      doc(ctx.firestore(), `organizations/${orgId}/events/${eventId}/artists/${artistId}`),
      artistFixture({ name: 'ARXX', status: 'confirmed', ...overrides }),
    )
  })
}

describe('artists/{artistId}', () => {
  beforeEach(async () => {
    await seedExistingArtist(ORG_A, EVENT_A, 'a1')
    await seedExistingArtist(ORG_A, EVENT_A, 'gone', { deletedAt: Timestamp.now() })
    await seedExistingArtist(ORG_B, EVENT_A, 'b1')
  })

  // 1. Booker in lila creates a valid artist — allow
  it('booker creates a valid artist', async () => {
    const db = actingAs(env, BOOKER_A)
    const ref = collection(db, `organizations/${ORG_A}/events/${EVENT_A}/artists`)
    await assertSucceeds(addDoc(ref, artistFixture()))
  })

  // 2. Booker in lila reads/writes an artist in orgB — deny
  it('booker cannot cross-tenant read', async () => {
    const db = actingAs(env, BOOKER_A)
    await assertFails(getDoc(doc(db, `organizations/${ORG_B}/events/${EVENT_A}/artists/b1`)))
  })

  it('booker cannot cross-tenant update', async () => {
    const db = actingAs(env, BOOKER_A)
    await assertFails(updateDoc(
      doc(db, `organizations/${ORG_B}/events/${EVENT_A}/artists/b1`),
      { name: 'X', updatedAt: Timestamp.now(), updatedBy: BOOKER_A.uid },
    ))
  })

  // 3. Anonymous read — deny
  it('anon read denied', async () => {
    const db = actingAsAnon(env)
    await assertFails(getDoc(doc(db, `organizations/${ORG_A}/events/${EVENT_A}/artists/a1`)))
  })

  // 4. Crew tries to update — deny
  it('crew cannot update', async () => {
    const db = actingAs(env, CREW_A)
    await assertFails(updateDoc(
      doc(db, `organizations/${ORG_A}/events/${EVENT_A}/artists/a1`),
      { comment: 'x', updatedAt: Timestamp.now(), updatedBy: CREW_A.uid },
    ))
  })

  // 5. Production updates fee — deny
  it('production cannot update fee', async () => {
    const db = actingAs(env, PROD_A)
    await assertFails(updateDoc(
      doc(db, `organizations/${ORG_A}/events/${EVENT_A}/artists/a1`),
      { fee: { amount: 1, currency: 'CHF' }, updatedAt: Timestamp.now(), updatedBy: PROD_A.uid },
    ))
  })

  // 6. Production updates intendedDay + checklist — allow
  it('production can update intendedDay and checklist', async () => {
    const db = actingAs(env, PROD_A)
    await assertSucceeds(updateDoc(
      doc(db, `organizations/${ORG_A}/events/${EVENT_A}/artists/a1`),
      {
        intendedDay: '2025-09-05',
        checklist: { 'tech-rider-received': { done: true } },
        updatedAt: Timestamp.now(),
        updatedBy: PROD_A.uid,
      },
    ))
  })

  // 7. PR updates shortDescription + links — allow
  it('pr can update shortDescription and links', async () => {
    const db = actingAs(env, PR_A)
    await assertSucceeds(updateDoc(
      doc(db, `organizations/${ORG_A}/events/${EVENT_A}/artists/a1`),
      {
        shortDescription: 'bio',
        links: { website: 'https://example' },
        updatedAt: Timestamp.now(),
        updatedBy: PR_A.uid,
      },
    ))
  })

  // 8. PR updates fee — deny
  it('pr cannot update fee', async () => {
    const db = actingAs(env, PR_A)
    await assertFails(updateDoc(
      doc(db, `organizations/${ORG_A}/events/${EVENT_A}/artists/a1`),
      { fee: { amount: 1, currency: 'CHF' }, updatedAt: Timestamp.now(), updatedBy: PR_A.uid },
    ))
  })

  // 9. Director hard-deletes — allow
  it('director can hard delete', async () => {
    const db = actingAs(env, DIRECTOR_A)
    await assertSucceeds(deleteDoc(doc(db, `organizations/${ORG_A}/events/${EVENT_A}/artists/a1`)))
  })

  // 10. Booker hard-deletes — deny
  it('booker cannot hard delete', async () => {
    const db = actingAs(env, BOOKER_A)
    await assertFails(deleteDoc(doc(db, `organizations/${ORG_A}/events/${EVENT_A}/artists/a1`)))
  })

  // 11. Create with missing/invalid fields — deny
  it('create with empty name denied', async () => {
    const db = actingAs(env, BOOKER_A)
    const ref = collection(db, `organizations/${ORG_A}/events/${EVENT_A}/artists`)
    await assertFails(addDoc(ref, artistFixture({ name: '' })))
  })

  it('create with invalid status denied', async () => {
    const db = actingAs(env, BOOKER_A)
    const ref = collection(db, `organizations/${ORG_A}/events/${EVENT_A}/artists`)
    await assertFails(addDoc(ref, artistFixture({ status: 'bogus' })))
  })

  it('create with createdBy != auth.uid denied', async () => {
    const db = actingAs(env, BOOKER_A)
    const ref = collection(db, `organizations/${ORG_A}/events/${EVENT_A}/artists`)
    await assertFails(addDoc(ref, artistFixture({ createdBy: 'someoneelse' })))
  })

  // 12. Update sets status to invalid value — deny
  it('update with invalid status denied', async () => {
    const db = actingAs(env, BOOKER_A)
    await assertFails(updateDoc(
      doc(db, `organizations/${ORG_A}/events/${EVENT_A}/artists/a1`),
      { status: 'bogus', updatedAt: Timestamp.now(), updatedBy: BOOKER_A.uid },
    ))
  })

  // 13. Soft-deleted artist read denied
  it('soft-deleted read denied', async () => {
    const db = actingAs(env, BOOKER_A)
    await assertFails(getDoc(doc(db, `organizations/${ORG_A}/events/${EVENT_A}/artists/gone`)))
  })

  // Cross-tenant booker covers row 2 deny
  it('cross-tenant booker cannot read other org artists', async () => {
    const db = actingAs(env, BOOKER_B)
    await assertFails(getDoc(doc(db, `organizations/${ORG_A}/events/${EVENT_A}/artists/a1`)))
  })
})

describe('artists/{artistId}/activity', () => {
  beforeEach(async () => {
    await seedExistingArtist(ORG_A, EVENT_A, 'a1')
  })

  it('member can read activity', async () => {
    const db = actingAs(env, FIN_A)
    await assertSucceeds(getDoc(doc(db, `organizations/${ORG_A}/events/${EVENT_A}/artists/a1/activity/x`)))
  })

  it('member can append activity with their own uid', async () => {
    const db = actingAs(env, BOOKER_A)
    const ref = collection(db, `organizations/${ORG_A}/events/${EVENT_A}/artists/a1/activity`)
    await assertSucceeds(addDoc(ref, {
      uid: BOOKER_A.uid, at: Timestamp.now(), field: 'status', before: 'planned', after: 'inquired',
    }))
  })

  it('member cannot append activity with another uid', async () => {
    const db = actingAs(env, BOOKER_A)
    const ref = collection(db, `organizations/${ORG_A}/events/${EVENT_A}/artists/a1/activity`)
    await assertFails(addDoc(ref, {
      uid: 'someoneelse', at: Timestamp.now(), field: 'status', before: 'planned', after: 'inquired',
    }))
  })

  it('activity entries are immutable', async () => {
    await seedAsAdmin(env, async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `organizations/${ORG_A}/events/${EVENT_A}/artists/a1/activity/log1`),
        { uid: BOOKER_A.uid, at: Timestamp.now(), field: 'status', before: 'planned', after: 'inquired' },
      )
    })
    const db = actingAs(env, BOOKER_A)
    await assertFails(updateDoc(
      doc(db, `organizations/${ORG_A}/events/${EVENT_A}/artists/a1/activity/log1`),
      { field: 'tampered' },
    ))
    await assertFails(deleteDoc(
      doc(db, `organizations/${ORG_A}/events/${EVENT_A}/artists/a1/activity/log1`),
    ))
  })
})
```

- [ ] **Step 3: Recompose the rules**

```bash
pnpm rules:compose 2>&1 | tail -3
grep -c '// ─── artists layer fragment ───' firestore.rules
```

Expected: `Composed firestore.rules and storage.rules` and the grep count is `1` — the artist fragment is now in the composed file.

- [ ] **Step 4: Run the rules-test suite**

```bash
pkill -f 'firebase emulators:start' 2>/dev/null; pkill -f 'nuxt dev' 2>/dev/null
export JAVA_HOME=/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home
export PATH=$JAVA_HOME/bin:$PATH
pnpm rules:check 2>&1 | tail -10
```

Expected: 54 (existing core tests) + 13 new artist tests + 4 activity tests = ~71 firestore tests + 3 storage tests, all passing.

If a test fails because a peer test seeded a doc the rules block under read, double-check `beforeEach { clearFirestore }` is present in this file and inherited from Plan B's test setup — each describe block re-seeds in its own beforeEach.

- [ ] **Step 5: Commit**

```bash
git add layers/artists/firestore.rules.frag layers/artists/test/firestore.rules.test.ts firestore.rules
git commit -m "feat(artists): firestore rules fragment + role-scoped rules tests"
```

---

## Task 13: Composite Firestore indexes for artist queries

**Files:**
- Modify: `firestore.indexes.json`

The existing `firestore.indexes.json` is a minimal `{ "indexes": [], "fieldOverrides": [] }`. We add the three indexes spec §5 lists.

- [ ] **Step 1: Read current `firestore.indexes.json`**

```bash
cat firestore.indexes.json
```

- [ ] **Step 2: Replace its contents with the artist indexes**

```json
{
  "indexes": [
    {
      "collectionGroup": "artists",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "deletedAt", "order": "ASCENDING" },
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "statusChangedAt", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "artists",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "deletedAt", "order": "ASCENDING" },
        { "fieldPath": "intendedDay", "order": "ASCENDING" },
        { "fieldPath": "intendedLocationId", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "artists",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "deletedAt", "order": "ASCENDING" },
        { "fieldPath": "responsibleUserId", "order": "ASCENDING" },
        { "fieldPath": "status", "order": "ASCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
```

- [ ] **Step 3: Verify the JSON parses**

```bash
python3 -c 'import json; print(len(json.load(open("firestore.indexes.json"))["indexes"]), "indexes loaded")'
```

Expected: `3 indexes loaded`.

The Firestore emulator does not enforce composite indexes (queries that would require one in prod just succeed locally). These ship for production deploys per spec §5; no local verification possible.

- [ ] **Step 4: Commit**

```bash
git add firestore.indexes.json
git commit -m "feat(artists): firestore composite indexes for list/schedule/responsible queries"
```

---

## Task 14: Final smoke check + PR

A final pass to confirm C1 is internally consistent.

- [ ] **Step 1: Run the full unit test suite**

```bash
pnpm test 2>&1 | tail -10
```

Expected: 5 (existing) + 7 (new artist composables) = 12 test files, all passing.

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 3: Run rules:check**

```bash
pkill -f 'firebase emulators:start' 2>/dev/null; pkill -f 'nuxt dev' 2>/dev/null
export JAVA_HOME=/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home
export PATH=$JAVA_HOME/bin:$PATH
pnpm rules:check 2>&1 | tail -5
```

Expected: ~71 firestore + 3 storage tests, all passing.

- [ ] **Step 4: Push the branch + open the PR**

```bash
git push -u origin feat/artists-c1-data-layer 2>&1 | tail -3
```

Then via the GitHub MCP, open a PR titled `feat(artists): C1 data layer — types + composables + rules + indexes` with body summarizing the slice and pointing at the spec / plan.

- [ ] **Step 5: Wait for CI green**

The same `ci.yml` workflow shipped in Plan B runs typecheck → composable tests → functions tests → rules:check on the PR. Poll status until green.

- [ ] **Step 6: Squash-merge once CI is green**

Via the GitHub MCP `merge_pull_request` with `merge_method: 'squash'`. Then locally:

```bash
git checkout main && git pull origin main
```

---

## Plan C1 done

When all tasks are checked off:
- `Organization` and `Event` types carry the new artist fields.
- `defaultArtistChecklistTemplate()` is wired into `seed-emulator.ts`.
- `layers/artists/` is a registered Nuxt 4 layer with shared types, app composables, and a firestore.rules.frag.
- Seven artist composables (`useArtistList`, `useArtist`, `useArtistMutations`, `useArtistResources`, `useArtistChecklistTemplate`, `useArtistFinancials`, `useArtistActivity`) are unit-tested and ready for UI consumption.
- The artist firestore rules are role-scoped per spec §10 and exercised by 17 rules-unit tests covering happy path, cross-tenant denial, role boundaries, anon denial, field-level constraints, and activity-subcollection rules.
- Composite indexes are declared and ship on the next `firebase deploy --only firestore`.

**Next:** Plan C2 — artist list view + detail view + kanban + status pill / filters / table / resource-link / activity components / pages.
