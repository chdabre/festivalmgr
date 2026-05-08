# Artist Management Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the v1 artist module — single artist document with status workflow, configurable per-event advancing checklist with resource-link requirements, list/detail/settings pages, role-scoped Firestore rules and tests, and an emulator seed.

**Architecture:** A new Nuxt layer `/layers/artists/` consuming `/layers/core/` types and composables. Each artist is a single Firestore document under `/organizations/{orgId}/events/{eventId}/artists/{artistId}`; checklist state and Drive-resource links nest inside the artist doc. The Event type is extended with `artistChecklistTemplate`; the Organization type with `artistCategories`. A `firestore.rules.frag` ships with `@firebase/rules-unit-testing`-backed tests for every clause from spec §10.

**Tech Stack:** Nuxt 3, Nuxt UI, TypeScript, Firebase Web SDK (Firestore client + Auth + Functions), Vitest, @firebase/rules-unit-testing, pnpm.

**Spec:** [docs/superpowers/specs/2026-05-08-artist-management-module-design.md](../specs/2026-05-08-artist-management-module-design.md)

**Prerequisites (must be complete before this plan runs):**
- [Plan A — bootstrap, auth & member admin](2026-05-08-festivalmgr-bootstrap-auth-admin.md) merged: core layer scaffolded, Firebase emulator wired up, login/dashboard/member-admin/event/location pages working, `useEvent` and `useLocation` composables exist.
- This plan ships the artist `firestore.rules.frag` + tests but does NOT replace the platform-wide permissive rules from Plan A — that's Plan B's job. The artist tests run their fragment standalone against the emulator. Plan B is expected to compose all module fragments into the production rules file.

---

## File Structure (created or modified in this plan)

```
festivalmgr/
├── nuxt.config.ts                                   (MODIFY: extend layers/artists)
├── firestore.indexes.json                           (MODIFY: 3 indexes)
├── package.json                                     (MODIFY: add @firebase/rules-unit-testing)
├── layers/
│   ├── core/
│   │   ├── types/
│   │   │   ├── organization.ts                     (MODIFY: + artistCategories)
│   │   │   └── event.ts                            (MODIFY: + artistChecklistTemplate, ChecklistItemConfig)
│   │   ├── composables/
│   │   │   └── useEvent.ts                         (MODIFY: seed artistChecklistTemplate on create)
│   │   └── pages/settings/
│   │       └── categories.vue                       (CREATE: artistCategories editor)
│   └── artists/                                     (CREATE)
│       ├── nuxt.config.ts
│       ├── firestore.rules.frag
│       ├── types/
│       │   ├── index.ts
│       │   ├── artist.ts
│       │   └── checklist.ts
│       ├── composables/
│       │   ├── useArtistList.ts
│       │   ├── useArtist.ts
│       │   ├── useArtistMutations.ts
│       │   ├── useArtistResources.ts
│       │   ├── useArtistChecklistTemplate.ts
│       │   ├── useArtistFinancials.ts
│       │   └── useArtistActivity.ts
│       ├── components/
│       │   ├── ArtistFilters.vue
│       │   ├── ArtistTable.vue
│       │   ├── ArtistKanban.vue
│       │   ├── ArtistStatusPill.vue
│       │   ├── ArtistDetailHeader.vue
│       │   ├── ArtistChecklistSection.vue
│       │   ├── ArtistResourceLinkRow.vue
│       │   ├── ArtistActivityList.vue
│       │   └── ChecklistTemplateEditor.vue
│       └── pages/
│           └── events/[eventId]/
│               ├── artists/
│               │   ├── index.vue
│               │   └── [artistId].vue
│               └── settings/
│                   └── artist-checklist.vue
├── tests/
│   ├── composables/
│   │   ├── useArtistList.test.ts
│   │   ├── useArtist.test.ts
│   │   ├── useArtistMutations.test.ts
│   │   ├── useArtistResources.test.ts
│   │   ├── useArtistChecklistTemplate.test.ts
│   │   ├── useArtistFinancials.test.ts
│   │   └── useArtistActivity.test.ts
│   ├── components/
│   │   ├── ArtistFilters.test.ts
│   │   └── ArtistResourceLinkRow.test.ts
│   └── rules/
│       ├── setup.ts
│       └── artists.rules.test.ts
└── scripts/
    └── seed-artists.ts
```

---

## Task 1: Extend core types (Organization, Event) with artist-module fields

**Files:**
- Modify: `layers/core/types/organization.ts`
- Modify: `layers/core/types/event.ts`

- [ ] **Step 1: Modify `layers/core/types/organization.ts` — add `artistCategories`**

```ts
import type { Timestamp } from 'firebase/firestore'

export type ModuleKey = 'artists' | 'budget' | 'booking' | 'riders' | 'schedule'

export interface Organization {
  name: string
  slug: string
  defaultLocale: string
  defaultCurrency: string
  enabledModules: ModuleKey[]
  artistCategories: string[]                     // per-org configurable list
  branding?: { logoStoragePath?: string; primaryColor?: string }
  createdAt: Timestamp
}
```

- [ ] **Step 2: Modify `layers/core/types/event.ts` — add `artistChecklistTemplate` + types**

```ts
import type { Timestamp } from 'firebase/firestore'

export type EventStatus = 'planning' | 'live' | 'archived'

export type ChecklistRequirement = { type: 'resource' }

export interface ChecklistItemConfig {
  id: string
  label: string
  description?: string
  order: number
  appliesToCategories?: string[]
  requirement?: ChecklistRequirement
}

export interface Event {
  name: string
  slug: string
  primaryLocale: string
  primaryContacts: string[]
  status: EventStatus
  dates: { start: Timestamp; end: Timestamp }
  publicSlug?: string
  publishToPublic: boolean
  artistChecklistTemplate: ChecklistItemConfig[]
  createdAt: Timestamp
  deletedAt: Timestamp | null
}
```

- [ ] **Step 3: Verify types compile**

```bash
pnpm exec nuxt prepare && pnpm exec tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add layers/core/types/organization.ts layers/core/types/event.ts
git commit -m "feat(core): extend Org with artistCategories and Event with checklist template"
```

---

## Task 2: Add default-checklist seed helper and seed it on event create

**Files:**
- Create: `layers/core/types/defaults.ts`
- Modify: `layers/core/composables/useEvent.ts`
- Modify: `tests/composables/useEvent.test.ts`

- [ ] **Step 1: Write `layers/core/types/defaults.ts` with the default checklist seed**

```ts
import type { ChecklistItemConfig } from './event'

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

- [ ] **Step 2: Add re-export to `layers/core/types/index.ts`**

Append to the existing barrel:
```ts
export * from './defaults'
```

- [ ] **Step 3: Modify `tests/composables/useEvent.test.ts` — extend the existing assertion**

Find the existing `expect(payload).toMatchObject(...)` call and replace its argument with:
```ts
{
  name: 'lila 2025', slug: 'lila-2025', status: 'planning',
  publishToPublic: false, deletedAt: null, primaryLocale: 'en',
  artistChecklistTemplate: expect.arrayContaining([
    expect.objectContaining({ id: 'tech-rider-received', requirement: { type: 'resource' } }),
  ]),
}
```

- [ ] **Step 4: Run test to verify failure**

```bash
pnpm exec vitest run tests/composables/useEvent.test.ts
```
Expected: FAIL — payload does not contain `artistChecklistTemplate`.

- [ ] **Step 5: Modify `layers/core/composables/useEvent.ts` — seed the template on create**

Replace the existing `createEvent` function body with:
```ts
const createEvent = (input: { name: string; slug: string; start: Date; end: Date }) => {
  const payload = {
    name: input.name,
    slug: input.slug,
    primaryLocale: 'en',
    primaryContacts: [],
    status: 'planning' as const,
    dates: { start: Timestamp.fromDate(input.start), end: Timestamp.fromDate(input.end) },
    publishToPublic: false,
    artistChecklistTemplate: defaultArtistChecklistTemplate(),
    createdAt: serverTimestamp(),
    deletedAt: null,
  }
  return addDoc(collection(db, 'organizations', orgId, 'events'), payload)
}
```

Add the import at the top:
```ts
import { defaultArtistChecklistTemplate } from '../types'
```

- [ ] **Step 6: Run test to verify pass**

```bash
pnpm exec vitest run tests/composables/useEvent.test.ts
```
Expected: 1 passed.

- [ ] **Step 7: Commit**

```bash
git add layers/core/types/defaults.ts layers/core/types/index.ts \
        layers/core/composables/useEvent.ts tests/composables/useEvent.test.ts
git commit -m "feat(core): seed artistChecklistTemplate on event create"
```

---

## Task 3: Scaffold the artists layer + register it in nuxt.config.ts

**Files:**
- Create: `layers/artists/nuxt.config.ts`
- Modify: `nuxt.config.ts`

- [ ] **Step 1: Write `layers/artists/nuxt.config.ts`**

```ts
import { defineNuxtConfig } from 'nuxt/config'

export default defineNuxtConfig({})
```

- [ ] **Step 2: Modify root `nuxt.config.ts` to extend the artists layer**

Find the `extends` array and add `'./layers/artists'`. If `extends` does not exist yet, add it:
```ts
extends: ['./layers/core', './layers/artists'],
```

- [ ] **Step 3: Verify Nuxt resolves both layers**

```bash
pnpm exec nuxt prepare
```
Expected: completes without errors.

- [ ] **Step 4: Commit**

```bash
git add layers/artists/nuxt.config.ts nuxt.config.ts
git commit -m "feat(artists): scaffold artists layer"
```

---

## Task 4: Add artist domain types

**Files:**
- Create: `layers/artists/types/artist.ts`, `checklist.ts`, `index.ts`

- [ ] **Step 1: Write `layers/artists/types/checklist.ts`**

```ts
import type { Timestamp } from 'firebase/firestore'

export interface ResourceLink {
  url: string
  title?: string
  kind?: 'file' | 'folder'
  addedBy: string
  addedAt: Timestamp
}

export interface ChecklistEntry {
  done: boolean
  autoSatisfied?: boolean
  doneAt?: Timestamp
  doneBy?: string
  resources?: ResourceLink[]
  note?: string
}
```

- [ ] **Step 2: Write `layers/artists/types/artist.ts`**

```ts
import type { Timestamp } from 'firebase/firestore'
import type { ChecklistEntry } from './checklist'

export type ArtistStatus = 'planned' | 'inquired' | 'confirmed' | 'declined' | 'cancelled'

export interface Artist {
  name: string
  category: string
  links: {
    website?: string
    instagram?: string
    other?: { label: string; url: string }[]
  }
  origin?: string
  shortDescription?: string

  status: ArtistStatus
  statusChangedAt: Timestamp
  primaryContact?: { name?: string; email?: string; role?: string; note?: string }
  responsibleUserId?: string

  fee?: { amount: number; currency: string }
  travelBudget?: { amount: number; currency: string }
  accommodation?: string
  daysPresent?: number
  dealNotes?: string

  intendedDay?: string
  intendedLocationId?: string
  performanceDurationMin?: number
  performanceNote?: string

  checklist: { [itemId: string]: ChecklistEntry }

  comment?: string
  customAttributes?: { [key: string]: unknown }

  createdAt: Timestamp
  createdBy: string
  updatedAt: Timestamp
  updatedBy: string
  deletedAt: Timestamp | null
}

export interface ActivityLogEntry {
  uid: string
  at: Timestamp
  field: string
  before: unknown
  after: unknown
}
```

- [ ] **Step 3: Write `layers/artists/types/index.ts` barrel**

```ts
export * from './artist'
export * from './checklist'
```

- [ ] **Step 4: Verify types compile**

```bash
pnpm exec nuxt prepare && pnpm exec tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add layers/artists/types/
git commit -m "feat(artists): add domain types"
```

---

## Task 5: Add `useArtistList` composable + tests

**Files:**
- Create: `layers/artists/composables/useArtistList.ts`
- Create: `tests/composables/useArtistList.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/composables/useArtistList.test.ts
import { describe, it, expect, vi } from 'vitest'

const mockOnSnapshot = vi.fn()
const mockQuery = vi.fn((...a: unknown[]) => a)
const mockWhere = vi.fn((field, op, value) => ({ field, op, value }))
const mockCollection = vi.fn((...a: unknown[]) => a)

vi.mock('firebase/firestore', () => ({
  collection: (...a: unknown[]) => mockCollection(...a),
  onSnapshot: (...a: unknown[]) => mockOnSnapshot(...a),
  query: (...a: unknown[]) => mockQuery(...a),
  where: (...a: unknown[]) => mockWhere(...a),
}))

vi.mock('#imports', () => ({
  useFirebase: () => ({ db: {} }),
  useState: <T>(_k: string, init: () => T) => ({ value: init() }),
  computed: <T>(fn: () => T) => ({ value: fn() }),
}))

describe('useArtistList', () => {
  it('builds a query scoped to the org/event with deletedAt == null', async () => {
    const { useArtistList } = await import('../../layers/artists/composables/useArtistList')
    const { subscribe } = useArtistList('lila', 'lila-2025')
    subscribe()
    expect(mockCollection).toHaveBeenCalledWith({}, 'organizations', 'lila', 'events', 'lila-2025', 'artists')
    expect(mockWhere).toHaveBeenCalledWith('deletedAt', '==', null)
    expect(mockOnSnapshot).toHaveBeenCalled()
  })

  it('filters by status when filter.status is set', async () => {
    const { useArtistList } = await import('../../layers/artists/composables/useArtistList')
    const filter = { status: ['planned', 'inquired'] }
    const { subscribe } = useArtistList('lila', 'lila-2025', filter)
    subscribe()
    expect(mockWhere).toHaveBeenCalledWith('status', 'in', ['planned', 'inquired'])
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm exec vitest run tests/composables/useArtistList.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write the composable**

```ts
// layers/artists/composables/useArtistList.ts
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import type { Artist, ArtistStatus } from '../types'

type ArtistRow = Artist & { id: string }

export interface ArtistListFilter {
  status?: ArtistStatus[]
  category?: string[]
  responsibleUserId?: string
}

export const useArtistList = (orgId: string, eventId: string, filter: ArtistListFilter = {}) => {
  const { db } = useFirebase()
  const artists = useState<ArtistRow[]>(`artists:${orgId}:${eventId}`, () => [])

  const subscribe = () => {
    const constraints = [where('deletedAt', '==', null)]
    if (filter.status && filter.status.length > 0) {
      constraints.push(where('status', 'in', filter.status))
    }
    if (filter.responsibleUserId) {
      constraints.push(where('responsibleUserId', '==', filter.responsibleUserId))
    }
    const ref = query(
      collection(db, 'organizations', orgId, 'events', eventId, 'artists'),
      ...constraints,
    )
    return onSnapshot(ref, (snap) => {
      let rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Artist) }))
      if (filter.category && filter.category.length > 0) {
        rows = rows.filter((a) => filter.category!.includes(a.category))
      }
      artists.value = rows
    })
  }

  return { artists, subscribe }
}
```

> Why `category` filters client-side: Firestore allows only one `in`/`array-contains-any` per query. Status filter has priority because it drives the bigger reduction in result set.

- [ ] **Step 4: Run to verify pass**

```bash
pnpm exec vitest run tests/composables/useArtistList.test.ts
```
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add layers/artists/composables/useArtistList.ts tests/composables/useArtistList.test.ts
git commit -m "feat(artists): useArtistList composable with status/category filters"
```

---

## Task 6: Add `useArtist` (single-doc) composable + tests

**Files:**
- Create: `layers/artists/composables/useArtist.ts`
- Create: `tests/composables/useArtist.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/composables/useArtist.test.ts
import { describe, it, expect, vi } from 'vitest'

const mockOnSnapshot = vi.fn()
const mockDoc = vi.fn((...a: unknown[]) => a)

vi.mock('firebase/firestore', () => ({
  doc: (...a: unknown[]) => mockDoc(...a),
  onSnapshot: (...a: unknown[]) => mockOnSnapshot(...a),
}))
vi.mock('#imports', () => ({
  useFirebase: () => ({ db: {} }),
  useState: <T>(_k: string, init: () => T) => ({ value: init() }),
}))

describe('useArtist', () => {
  it('subscribes to the correct doc path', async () => {
    const { useArtist } = await import('../../layers/artists/composables/useArtist')
    const { subscribe } = useArtist('lila', 'lila-2025', 'abc')
    subscribe()
    expect(mockDoc).toHaveBeenCalledWith({}, 'organizations', 'lila', 'events', 'lila-2025', 'artists', 'abc')
    expect(mockOnSnapshot).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm exec vitest run tests/composables/useArtist.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write the composable**

```ts
// layers/artists/composables/useArtist.ts
import { doc, onSnapshot } from 'firebase/firestore'
import type { Artist } from '../types'

type ArtistDoc = Artist & { id: string }

export const useArtist = (orgId: string, eventId: string, artistId: string) => {
  const { db } = useFirebase()
  const artist = useState<ArtistDoc | null>(`artist:${orgId}:${eventId}:${artistId}`, () => null)

  const subscribe = () => {
    const ref = doc(db, 'organizations', orgId, 'events', eventId, 'artists', artistId)
    return onSnapshot(ref, (snap) => {
      artist.value = snap.exists() ? ({ id: snap.id, ...(snap.data() as Artist) }) : null
    })
  }

  return { artist, subscribe }
}
```

- [ ] **Step 4: Run to verify pass**

```bash
pnpm exec vitest run tests/composables/useArtist.test.ts
```
Expected: 1 passed.

- [ ] **Step 5: Commit**

```bash
git add layers/artists/composables/useArtist.ts tests/composables/useArtist.test.ts
git commit -m "feat(artists): useArtist single-doc composable"
```

---

## Task 7: Add `useArtistMutations` composable + tests

**Files:**
- Create: `layers/artists/composables/useArtistMutations.ts`
- Create: `tests/composables/useArtistMutations.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/composables/useArtistMutations.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAddDoc = vi.fn().mockResolvedValue({ id: 'new1' })
const mockUpdateDoc = vi.fn().mockResolvedValue(undefined)
const mockServerTimestamp = vi.fn(() => 'TS')
const mockCollection = vi.fn((...a: unknown[]) => a)
const mockDoc = vi.fn((...a: unknown[]) => a)

vi.mock('firebase/firestore', () => ({
  collection: (...a: unknown[]) => mockCollection(...a),
  doc: (...a: unknown[]) => mockDoc(...a),
  addDoc: (...a: unknown[]) => mockAddDoc(...a),
  updateDoc: (...a: unknown[]) => mockUpdateDoc(...a),
  serverTimestamp: () => mockServerTimestamp(),
}))
vi.mock('#imports', () => ({
  useFirebase: () => ({ db: {} }),
  useUser: () => ({ user: { value: { uid: 'u1' } } }),
}))

beforeEach(() => {
  mockAddDoc.mockClear()
  mockUpdateDoc.mockClear()
})

describe('useArtistMutations', () => {
  it('createArtist sets defaults: status=planned, statusChangedAt, createdBy/updatedBy=current uid, deletedAt=null, empty checklist', async () => {
    const { useArtistMutations } = await import('../../layers/artists/composables/useArtistMutations')
    const { createArtist } = useArtistMutations('lila', 'lila-2025')
    await createArtist({ name: 'ARXX', category: 'Musikact' })
    expect(mockAddDoc).toHaveBeenCalled()
    const payload = mockAddDoc.mock.calls[0][1]
    expect(payload).toMatchObject({
      name: 'ARXX', category: 'Musikact',
      status: 'planned',
      checklist: {},
      createdBy: 'u1', updatedBy: 'u1',
      responsibleUserId: 'u1',
      deletedAt: null,
    })
  })

  it('transitionStatus sets statusChangedAt and updatedBy', async () => {
    const { useArtistMutations } = await import('../../layers/artists/composables/useArtistMutations')
    const { transitionStatus } = useArtistMutations('lila', 'lila-2025')
    await transitionStatus('abc', 'inquired')
    const patch = mockUpdateDoc.mock.calls[0][1]
    expect(patch).toMatchObject({
      status: 'inquired',
      statusChangedAt: 'TS',
      updatedBy: 'u1',
      updatedAt: 'TS',
    })
  })

  it('softDeleteArtist sets deletedAt to a serverTimestamp and updatedBy', async () => {
    const { useArtistMutations } = await import('../../layers/artists/composables/useArtistMutations')
    const { softDeleteArtist } = useArtistMutations('lila', 'lila-2025')
    await softDeleteArtist('abc')
    const patch = mockUpdateDoc.mock.calls[0][1]
    expect(patch).toMatchObject({ deletedAt: 'TS', updatedBy: 'u1' })
  })

  it('updateArtist always stamps updatedAt and updatedBy', async () => {
    const { useArtistMutations } = await import('../../layers/artists/composables/useArtistMutations')
    const { updateArtist } = useArtistMutations('lila', 'lila-2025')
    await updateArtist('abc', { fee: { amount: 1000, currency: 'CHF' } })
    const patch = mockUpdateDoc.mock.calls[0][1]
    expect(patch).toMatchObject({
      fee: { amount: 1000, currency: 'CHF' },
      updatedAt: 'TS',
      updatedBy: 'u1',
    })
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm exec vitest run tests/composables/useArtistMutations.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write the composable**

```ts
// layers/artists/composables/useArtistMutations.ts
import { collection, doc, addDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import type { Artist, ArtistStatus } from '../types'

type ArtistCreateInput = Pick<Artist, 'name' | 'category'> & Partial<Omit<Artist, 'name' | 'category'>>

export const useArtistMutations = (orgId: string, eventId: string) => {
  const { db } = useFirebase()
  const { user } = useUser()

  const requireUid = (): string => {
    const uid = user.value?.uid
    if (!uid) throw new Error('useArtistMutations: not signed in')
    return uid
  }

  const collRef = () => collection(db, 'organizations', orgId, 'events', eventId, 'artists')
  const docRef = (id: string) => doc(db, 'organizations', orgId, 'events', eventId, 'artists', id)

  const createArtist = (input: ArtistCreateInput) => {
    const uid = requireUid()
    const ts = serverTimestamp()
    const payload = {
      links: {},
      checklist: {},
      ...input,
      status: input.status ?? 'planned',
      statusChangedAt: ts,
      responsibleUserId: input.responsibleUserId ?? uid,
      createdAt: ts,
      createdBy: uid,
      updatedAt: ts,
      updatedBy: uid,
      deletedAt: null,
    }
    return addDoc(collRef(), payload)
  }

  const updateArtist = (artistId: string, patch: Partial<Artist>) => {
    const uid = requireUid()
    return updateDoc(docRef(artistId), {
      ...patch,
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    })
  }

  const transitionStatus = (artistId: string, next: ArtistStatus) => {
    const uid = requireUid()
    const ts = serverTimestamp()
    return updateDoc(docRef(artistId), {
      status: next,
      statusChangedAt: ts,
      updatedAt: ts,
      updatedBy: uid,
    })
  }

  const softDeleteArtist = (artistId: string) => {
    const uid = requireUid()
    const ts = serverTimestamp()
    return updateDoc(docRef(artistId), {
      deletedAt: ts,
      updatedAt: ts,
      updatedBy: uid,
    })
  }

  return { createArtist, updateArtist, transitionStatus, softDeleteArtist }
}
```

- [ ] **Step 4: Run to verify pass**

```bash
pnpm exec vitest run tests/composables/useArtistMutations.test.ts
```
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add layers/artists/composables/useArtistMutations.ts tests/composables/useArtistMutations.test.ts
git commit -m "feat(artists): useArtistMutations composable (create/update/transition/softDelete)"
```

---

## Task 8: Add `useArtistResources` composable + tests

**Files:**
- Create: `layers/artists/composables/useArtistResources.ts`
- Create: `tests/composables/useArtistResources.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/composables/useArtistResources.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockUpdateDoc = vi.fn().mockResolvedValue(undefined)
const mockArrayUnion = vi.fn((...a: unknown[]) => ({ __arrayUnion: a }))
const mockArrayRemove = vi.fn((...a: unknown[]) => ({ __arrayRemove: a }))
const mockServerTimestamp = vi.fn(() => 'TS')
const mockDoc = vi.fn((...a: unknown[]) => a)

vi.mock('firebase/firestore', () => ({
  doc: (...a: unknown[]) => mockDoc(...a),
  updateDoc: (...a: unknown[]) => mockUpdateDoc(...a),
  arrayUnion: (...a: unknown[]) => mockArrayUnion(...a),
  arrayRemove: (...a: unknown[]) => mockArrayRemove(...a),
  serverTimestamp: () => mockServerTimestamp(),
}))
vi.mock('#imports', () => ({
  useFirebase: () => ({ db: {} }),
  useUser: () => ({ user: { value: { uid: 'u1' } } }),
}))

beforeEach(() => { mockUpdateDoc.mockClear() })

describe('useArtistResources', () => {
  it('addResourceToTask appends a ResourceLink with kind heuristic from URL', async () => {
    const { useArtistResources } = await import('../../layers/artists/composables/useArtistResources')
    const { addResourceToTask } = useArtistResources('lila', 'lila-2025')
    await addResourceToTask('abc', 'tech-rider-received', {
      url: 'https://drive.google.com/drive/folders/abc123',
      title: 'Rider folder',
    })
    const patch = mockUpdateDoc.mock.calls[0][1]
    expect(patch['checklist.tech-rider-received.resources']).toEqual({
      __arrayUnion: [expect.objectContaining({
        url: 'https://drive.google.com/drive/folders/abc123',
        title: 'Rider folder',
        kind: 'folder',
        addedBy: 'u1',
        addedAt: 'TS',
      })],
    })
  })

  it('addResourceToTask infers kind=file for /file/ URLs', async () => {
    const { useArtistResources } = await import('../../layers/artists/composables/useArtistResources')
    const { addResourceToTask } = useArtistResources('lila', 'lila-2025')
    await addResourceToTask('abc', 'contract-signed', {
      url: 'https://drive.google.com/file/d/xyz/view',
    })
    const patch = mockUpdateDoc.mock.calls[0][1]
    expect(patch['checklist.contract-signed.resources']).toEqual({
      __arrayUnion: [expect.objectContaining({ kind: 'file' })],
    })
  })

  it('removeResourceFromTask uses arrayRemove with the exact link', async () => {
    const { useArtistResources } = await import('../../layers/artists/composables/useArtistResources')
    const { removeResourceFromTask } = useArtistResources('lila', 'lila-2025')
    const link = { url: 'https://drive.google.com/file/d/xyz', title: 't', kind: 'file' as const, addedBy: 'u2', addedAt: 'TS-prev' as never }
    await removeResourceFromTask('abc', 'contract-signed', link)
    const patch = mockUpdateDoc.mock.calls[0][1]
    expect(patch['checklist.contract-signed.resources']).toEqual({ __arrayRemove: [link] })
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm exec vitest run tests/composables/useArtistResources.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write the composable**

```ts
// layers/artists/composables/useArtistResources.ts
import { doc, updateDoc, arrayUnion, arrayRemove, serverTimestamp } from 'firebase/firestore'
import type { ResourceLink } from '../types'

const inferKind = (url: string): 'file' | 'folder' | undefined => {
  if (url.includes('drive.google.com/drive/folders/')) return 'folder'
  if (url.includes('drive.google.com/file/')) return 'file'
  return undefined
}

export const useArtistResources = (orgId: string, eventId: string) => {
  const { db } = useFirebase()
  const { user } = useUser()

  const docRef = (id: string) => doc(db, 'organizations', orgId, 'events', eventId, 'artists', id)

  const addResourceToTask = (
    artistId: string,
    itemId: string,
    input: { url: string; title?: string; kind?: 'file' | 'folder' },
  ) => {
    const uid = user.value?.uid
    if (!uid) throw new Error('useArtistResources: not signed in')
    const link: ResourceLink = {
      url: input.url,
      title: input.title,
      kind: input.kind ?? inferKind(input.url),
      addedBy: uid,
      addedAt: serverTimestamp() as never,
    }
    return updateDoc(docRef(artistId), {
      [`checklist.${itemId}.resources`]: arrayUnion(link),
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    })
  }

  const removeResourceFromTask = (artistId: string, itemId: string, link: ResourceLink) => {
    const uid = user.value?.uid
    if (!uid) throw new Error('useArtistResources: not signed in')
    return updateDoc(docRef(artistId), {
      [`checklist.${itemId}.resources`]: arrayRemove(link),
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    })
  }

  return { addResourceToTask, removeResourceFromTask }
}
```

- [ ] **Step 4: Run to verify pass**

```bash
pnpm exec vitest run tests/composables/useArtistResources.test.ts
```
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add layers/artists/composables/useArtistResources.ts tests/composables/useArtistResources.test.ts
git commit -m "feat(artists): useArtistResources composable for Drive-link checklist resources"
```

---

## Task 9: Add `useArtistChecklistTemplate` composable + tests

**Files:**
- Create: `layers/artists/composables/useArtistChecklistTemplate.ts`
- Create: `tests/composables/useArtistChecklistTemplate.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/composables/useArtistChecklistTemplate.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockOnSnapshot = vi.fn()
const mockUpdateDoc = vi.fn().mockResolvedValue(undefined)
const mockDoc = vi.fn((...a: unknown[]) => a)
const mockServerTimestamp = vi.fn(() => 'TS')

vi.mock('firebase/firestore', () => ({
  doc: (...a: unknown[]) => mockDoc(...a),
  onSnapshot: (...a: unknown[]) => mockOnSnapshot(...a),
  updateDoc: (...a: unknown[]) => mockUpdateDoc(...a),
  serverTimestamp: () => mockServerTimestamp(),
}))
vi.mock('#imports', () => ({
  useFirebase: () => ({ db: {} }),
  useState: <T>(_k: string, init: () => T) => ({ value: init() }),
}))

beforeEach(() => { mockUpdateDoc.mockClear() })

describe('useArtistChecklistTemplate', () => {
  it('saveTemplate writes only the artistChecklistTemplate field on the event', async () => {
    const { useArtistChecklistTemplate } = await import('../../layers/artists/composables/useArtistChecklistTemplate')
    const { saveTemplate } = useArtistChecklistTemplate('lila', 'lila-2025')
    await saveTemplate([
      { id: 'a', label: 'A', order: 1 },
      { id: 'b', label: 'B', order: 2, requirement: { type: 'resource' } },
    ])
    expect(mockUpdateDoc).toHaveBeenCalled()
    const patch = mockUpdateDoc.mock.calls[0][1]
    expect(patch).toEqual({
      artistChecklistTemplate: [
        { id: 'a', label: 'A', order: 1 },
        { id: 'b', label: 'B', order: 2, requirement: { type: 'resource' } },
      ],
    })
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm exec vitest run tests/composables/useArtistChecklistTemplate.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write the composable**

```ts
// layers/artists/composables/useArtistChecklistTemplate.ts
import { doc, onSnapshot, updateDoc } from 'firebase/firestore'
import type { ChecklistItemConfig } from '~/layers/core/types'

export const useArtistChecklistTemplate = (orgId: string, eventId: string) => {
  const { db } = useFirebase()
  const template = useState<ChecklistItemConfig[]>(
    `artistChecklistTemplate:${orgId}:${eventId}`,
    () => [],
  )

  const subscribe = () => {
    const ref = doc(db, 'organizations', orgId, 'events', eventId)
    return onSnapshot(ref, (snap) => {
      const data = snap.data() as { artistChecklistTemplate?: ChecklistItemConfig[] } | undefined
      template.value = data?.artistChecklistTemplate ?? []
    })
  }

  const saveTemplate = (next: ChecklistItemConfig[]) => {
    const ref = doc(db, 'organizations', orgId, 'events', eventId)
    return updateDoc(ref, { artistChecklistTemplate: next })
  }

  return { template, subscribe, saveTemplate }
}
```

- [ ] **Step 4: Run to verify pass**

```bash
pnpm exec vitest run tests/composables/useArtistChecklistTemplate.test.ts
```
Expected: 1 passed.

- [ ] **Step 5: Commit**

```bash
git add layers/artists/composables/useArtistChecklistTemplate.ts tests/composables/useArtistChecklistTemplate.test.ts
git commit -m "feat(artists): useArtistChecklistTemplate composable"
```

---

## Task 10: Add `useArtistFinancials` rollup composable + tests

**Files:**
- Create: `layers/artists/composables/useArtistFinancials.ts`
- Create: `tests/composables/useArtistFinancials.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/composables/useArtistFinancials.test.ts
import { describe, it, expect } from 'vitest'

describe('rollupArtistFinancials (pure helper)', () => {
  it('sums fee and travelBudget across non-terminal statuses, grouped by category', async () => {
    const { rollupArtistFinancials } = await import('../../layers/artists/composables/useArtistFinancials')
    const result = rollupArtistFinancials([
      { name: 'A', category: 'Musikact', status: 'confirmed', fee: { amount: 4000, currency: 'CHF' }, travelBudget: { amount: 500, currency: 'CHF' } },
      { name: 'B', category: 'Musikact', status: 'inquired',  fee: { amount: 2000, currency: 'CHF' } },
      { name: 'C', category: 'DJ',       status: 'confirmed', fee: { amount: 300,  currency: 'CHF' } },
      { name: 'D', category: 'DJ',       status: 'declined',  fee: { amount: 9999, currency: 'CHF' } },  // excluded
      { name: 'E', category: 'DJ',       status: 'cancelled', fee: { amount: 9999, currency: 'CHF' } },  // excluded
      { name: 'F', category: 'DJ',       status: 'planned',   fee: { amount: 100,  currency: 'CHF' } },
    ] as never)
    expect(result.feeTotal).toBe(6400)
    expect(result.travelTotal).toBe(500)
    expect(result.byCategory['Musikact']).toEqual({ fee: 6000, travel: 500 })
    expect(result.byCategory['DJ']).toEqual({ fee: 400, travel: 0 })
  })

  it('warns about mixed currencies', async () => {
    const { rollupArtistFinancials } = await import('../../layers/artists/composables/useArtistFinancials')
    const result = rollupArtistFinancials([
      { name: 'A', category: 'X', status: 'confirmed', fee: { amount: 1, currency: 'CHF' } },
      { name: 'B', category: 'X', status: 'confirmed', fee: { amount: 1, currency: 'EUR' } },
    ] as never)
    expect(result.mixedCurrencies).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm exec vitest run tests/composables/useArtistFinancials.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write the composable**

```ts
// layers/artists/composables/useArtistFinancials.ts
import { computed } from 'vue'
import type { Artist } from '../types'
import { useArtistList } from './useArtistList'

const COUNTABLE: Artist['status'][] = ['planned', 'inquired', 'confirmed']

export interface ArtistFinancialsRollup {
  feeTotal: number
  travelTotal: number
  byCategory: Record<string, { fee: number; travel: number }>
  mixedCurrencies: boolean
  currency?: string
}

export const rollupArtistFinancials = (
  artists: Pick<Artist, 'category' | 'status' | 'fee' | 'travelBudget'>[],
): ArtistFinancialsRollup => {
  let feeTotal = 0
  let travelTotal = 0
  const byCategory: Record<string, { fee: number; travel: number }> = {}
  const currencies = new Set<string>()

  for (const a of artists) {
    if (!COUNTABLE.includes(a.status)) continue
    const fee = a.fee?.amount ?? 0
    const travel = a.travelBudget?.amount ?? 0
    feeTotal += fee
    travelTotal += travel
    byCategory[a.category] ??= { fee: 0, travel: 0 }
    byCategory[a.category].fee += fee
    byCategory[a.category].travel += travel
    if (a.fee?.currency) currencies.add(a.fee.currency)
    if (a.travelBudget?.currency) currencies.add(a.travelBudget.currency)
  }

  return {
    feeTotal,
    travelTotal,
    byCategory,
    mixedCurrencies: currencies.size > 1,
    currency: currencies.size === 1 ? [...currencies][0] : undefined,
  }
}

export const useArtistFinancials = (orgId: string, eventId: string) => {
  const { artists } = useArtistList(orgId, eventId)
  const rollup = computed(() => rollupArtistFinancials(artists.value))
  return { rollup }
}
```

- [ ] **Step 4: Run to verify pass**

```bash
pnpm exec vitest run tests/composables/useArtistFinancials.test.ts
```
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add layers/artists/composables/useArtistFinancials.ts tests/composables/useArtistFinancials.test.ts
git commit -m "feat(artists): useArtistFinancials rollup composable"
```

---

## Task 11: Add `useArtistActivity` composable + tests

**Files:**
- Create: `layers/artists/composables/useArtistActivity.ts`
- Create: `tests/composables/useArtistActivity.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/composables/useArtistActivity.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAddDoc = vi.fn().mockResolvedValue({ id: 'log1' })
const mockOnSnapshot = vi.fn()
const mockCollection = vi.fn((...a: unknown[]) => a)
const mockQuery = vi.fn((...a: unknown[]) => a)
const mockOrderBy = vi.fn((field, dir) => ({ field, dir }))
const mockLimit = vi.fn((n) => ({ limit: n }))
const mockServerTimestamp = vi.fn(() => 'TS')

vi.mock('firebase/firestore', () => ({
  collection: (...a: unknown[]) => mockCollection(...a),
  addDoc: (...a: unknown[]) => mockAddDoc(...a),
  onSnapshot: (...a: unknown[]) => mockOnSnapshot(...a),
  query: (...a: unknown[]) => mockQuery(...a),
  orderBy: (...a: unknown[]) => mockOrderBy(...a),
  limit: (...a: unknown[]) => mockLimit(...a),
  serverTimestamp: () => mockServerTimestamp(),
}))
vi.mock('#imports', () => ({
  useFirebase: () => ({ db: {} }),
  useUser: () => ({ user: { value: { uid: 'u1' } } }),
  useState: <T>(_k: string, init: () => T) => ({ value: init() }),
}))

beforeEach(() => { mockAddDoc.mockClear() })

describe('useArtistActivity', () => {
  it('logChange writes a row with uid, field, before, after', async () => {
    const { useArtistActivity } = await import('../../layers/artists/composables/useArtistActivity')
    const { logChange } = useArtistActivity('lila', 'lila-2025', 'abc')
    await logChange('status', 'planned', 'inquired')
    const payload = mockAddDoc.mock.calls[0][1]
    expect(payload).toMatchObject({
      uid: 'u1', field: 'status', before: 'planned', after: 'inquired', at: 'TS',
    })
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm exec vitest run tests/composables/useArtistActivity.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write the composable**

```ts
// layers/artists/composables/useArtistActivity.ts
import { collection, addDoc, onSnapshot, query, orderBy, limit, serverTimestamp } from 'firebase/firestore'
import type { ActivityLogEntry } from '../types'

type ActivityRow = ActivityLogEntry & { id: string }

export const useArtistActivity = (orgId: string, eventId: string, artistId: string) => {
  const { db } = useFirebase()
  const { user } = useUser()
  const entries = useState<ActivityRow[]>(
    `artistActivity:${orgId}:${eventId}:${artistId}`,
    () => [],
  )

  const collRef = () =>
    collection(db, 'organizations', orgId, 'events', eventId, 'artists', artistId, 'activity')

  const subscribe = (max = 20) => {
    const ref = query(collRef(), orderBy('at', 'desc'), limit(max))
    return onSnapshot(ref, (snap) => {
      entries.value = snap.docs.map((d) => ({ id: d.id, ...(d.data() as ActivityLogEntry) }))
    })
  }

  const logChange = (field: string, before: unknown, after: unknown) => {
    const uid = user.value?.uid
    if (!uid) throw new Error('useArtistActivity: not signed in')
    return addDoc(collRef(), {
      uid,
      at: serverTimestamp(),
      field,
      before: before ?? null,
      after: after ?? null,
    })
  }

  return { entries, subscribe, logChange }
}
```

- [ ] **Step 4: Run to verify pass**

```bash
pnpm exec vitest run tests/composables/useArtistActivity.test.ts
```
Expected: 1 passed.

- [ ] **Step 5: Commit**

```bash
git add layers/artists/composables/useArtistActivity.ts tests/composables/useArtistActivity.test.ts
git commit -m "feat(artists): useArtistActivity append-only audit log composable"
```

---

## Task 12: Add Firestore rules fragment + rules-unit tests

**Files:**
- Create: `layers/artists/firestore.rules.frag`
- Create: `tests/rules/setup.ts`
- Create: `tests/rules/artists.rules.test.ts`
- Modify: `package.json` (add `@firebase/rules-unit-testing`)

- [ ] **Step 1: Install the rules-unit-testing SDK**

```bash
pnpm add -D @firebase/rules-unit-testing
```

- [ ] **Step 2: Write `layers/artists/firestore.rules.frag`**

This fragment is intended to be concatenated into the production rules file by the compose-rules pipeline that Plan B will deliver. It assumes the helpers `inOrg`, `hasRole`, `affectedFields`, `onlyFieldsChanged` are defined in the rules header. For these tests we wrap the fragment with a self-contained header.

```
match /events/{eventId}/artists/{artistId} {

  allow read: if inOrg(orgId)
              && hasRole(['director','booker','production','finance','pr','crew'])
              && resource.data.deletedAt == null;

  allow create: if inOrg(orgId)
                && hasRole(['director','booker'])
                && isValidArtistOnCreate(request.resource.data);

  allow update: if inOrg(orgId)
                && resource.data.deletedAt == null
                && (
                  (hasRole(['director','booker']) && isValidArtistOnUpdate(request.resource.data))
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

- [ ] **Step 3: Write `tests/rules/setup.ts`** — composes the fragment with helpers and provides test helpers

```ts
// tests/rules/setup.ts
import {
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { setDoc, doc, Timestamp, serverTimestamp } from 'firebase/firestore'

const RULES_HEADER = `
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isSignedIn()     { return request.auth != null; }
    function claimOrgId()     { return request.auth.token.orgId; }
    function claimRole()      { return request.auth.token.role; }
    function inOrg(orgId)     { return isSignedIn() && claimOrgId() == orgId; }
    function hasRole(roles)   { return isSignedIn() && claimRole() in roles; }
    function affectedFields() { return request.resource.data.diff(resource.data).affectedKeys(); }
    function onlyFieldsChanged(allowed) { return affectedFields().hasOnly(allowed); }
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

    match /organizations/{orgId} {
`
const RULES_FOOTER = `
    }
  }
}
`

export const buildRules = (): string => {
  const fragment = readFileSync(
    resolve(__dirname, '../../layers/artists/firestore.rules.frag'),
    'utf8',
  )
  return RULES_HEADER + fragment + RULES_FOOTER
}

export const newEnv = async (): Promise<RulesTestEnvironment> =>
  initializeTestEnvironment({
    projectId: `rules-test-${Date.now()}`,
    firestore: { rules: buildRules() },
  })

export const seedArtist = async (
  env: RulesTestEnvironment,
  orgId: string,
  eventId: string,
  artistId: string,
  overrides: Record<string, unknown> = {},
) => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'organizations', orgId, 'events', eventId, 'artists', artistId), {
      name: 'ARXX',
      category: 'Musikact',
      status: 'confirmed',
      statusChangedAt: Timestamp.now(),
      checklist: {},
      links: {},
      createdAt: Timestamp.now(),
      createdBy: 'seed',
      updatedAt: Timestamp.now(),
      updatedBy: 'seed',
      deletedAt: null,
      ...overrides,
    })
  })
}

export const auth = (env: RulesTestEnvironment, uid: string, orgId: string, role: string) =>
  env.authenticatedContext(uid, { orgId, role })
```

- [ ] **Step 4: Write the failing rules tests**

```ts
// tests/rules/artists.rules.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import { addDoc, collection, deleteDoc, doc, getDoc, setDoc, updateDoc, Timestamp } from 'firebase/firestore'
import { newEnv, seedArtist, auth } from './setup'
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing'

let env: RulesTestEnvironment

beforeAll(async () => { env = await newEnv() })
afterAll(async () => { await env.cleanup() })

const baseArtist = (overrides: Record<string, unknown> = {}) => ({
  name: 'NewArt',
  category: 'Musikact',
  status: 'planned',
  statusChangedAt: Timestamp.now(),
  checklist: {},
  links: {},
  createdAt: Timestamp.now(),
  createdBy: 'u1',
  updatedAt: Timestamp.now(),
  updatedBy: 'u1',
  deletedAt: null,
  ...overrides,
})

describe('artist rules', () => {
  beforeAll(async () => {
    await seedArtist(env, 'lila', 'e1', 'a1')
    await seedArtist(env, 'lila', 'e1', 'gone', { deletedAt: Timestamp.now() })
    await seedArtist(env, 'orgB', 'e1', 'a2')
  })

  it('1. Booker in lila creates a valid artist — allow', async () => {
    const db = auth(env, 'u1', 'lila', 'booker').firestore()
    await assertSucceeds(addDoc(collection(db, 'organizations', 'lila', 'events', 'e1', 'artists'), baseArtist()))
  })

  it('2. Booker in lila reads/writes an artist in orgB — deny', async () => {
    const db = auth(env, 'u1', 'lila', 'booker').firestore()
    await assertFails(getDoc(doc(db, 'organizations', 'orgB', 'events', 'e1', 'artists', 'a2')))
    await assertFails(updateDoc(doc(db, 'organizations', 'orgB', 'events', 'e1', 'artists', 'a2'),
      { name: 'X', updatedBy: 'u1' }))
  })

  it('3. Anonymous read — deny', async () => {
    const db = env.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(db, 'organizations', 'lila', 'events', 'e1', 'artists', 'a1')))
  })

  it('4. Crew tries to update — deny', async () => {
    const db = auth(env, 'u3', 'lila', 'crew').firestore()
    await assertFails(updateDoc(doc(db, 'organizations', 'lila', 'events', 'e1', 'artists', 'a1'),
      { comment: 'x', updatedBy: 'u3' }))
  })

  it('5. Production updates fee — deny', async () => {
    const db = auth(env, 'u4', 'lila', 'production').firestore()
    await assertFails(updateDoc(doc(db, 'organizations', 'lila', 'events', 'e1', 'artists', 'a1'),
      { fee: { amount: 1, currency: 'CHF' }, updatedBy: 'u4' }))
  })

  it('6. Production updates intendedDay and checklist — allow', async () => {
    const db = auth(env, 'u4', 'lila', 'production').firestore()
    await assertSucceeds(updateDoc(doc(db, 'organizations', 'lila', 'events', 'e1', 'artists', 'a1'), {
      intendedDay: '2025-09-05',
      checklist: { 'tech-rider-received': { done: true } },
      updatedAt: Timestamp.now(),
      updatedBy: 'u4',
    }))
  })

  it('7. PR updates shortDescription and links — allow', async () => {
    const db = auth(env, 'u5', 'lila', 'pr').firestore()
    await assertSucceeds(updateDoc(doc(db, 'organizations', 'lila', 'events', 'e1', 'artists', 'a1'), {
      shortDescription: 'bio',
      links: { website: 'https://x' },
      updatedAt: Timestamp.now(),
      updatedBy: 'u5',
    }))
  })

  it('8. PR updates fee — deny', async () => {
    const db = auth(env, 'u5', 'lila', 'pr').firestore()
    await assertFails(updateDoc(doc(db, 'organizations', 'lila', 'events', 'e1', 'artists', 'a1'),
      { fee: { amount: 1, currency: 'CHF' }, updatedBy: 'u5' }))
  })

  it('9. Director hard-deletes — allow', async () => {
    const db = auth(env, 'u0', 'lila', 'director').firestore()
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'organizations', 'lila', 'events', 'e1', 'artists', 'todelete'),
        baseArtist())
    })
    await assertSucceeds(deleteDoc(doc(db, 'organizations', 'lila', 'events', 'e1', 'artists', 'todelete')))
  })

  it('10. Booker hard-deletes — deny', async () => {
    const db = auth(env, 'u1', 'lila', 'booker').firestore()
    await assertFails(deleteDoc(doc(db, 'organizations', 'lila', 'events', 'e1', 'artists', 'a1')))
  })

  it('11a. Create with empty name — deny', async () => {
    const db = auth(env, 'u1', 'lila', 'booker').firestore()
    await assertFails(addDoc(collection(db, 'organizations', 'lila', 'events', 'e1', 'artists'),
      baseArtist({ name: '' })))
  })

  it('11b. Create with invalid status — deny', async () => {
    const db = auth(env, 'u1', 'lila', 'booker').firestore()
    await assertFails(addDoc(collection(db, 'organizations', 'lila', 'events', 'e1', 'artists'),
      baseArtist({ status: 'bogus' })))
  })

  it('11c. Create with createdBy != auth.uid — deny', async () => {
    const db = auth(env, 'u1', 'lila', 'booker').firestore()
    await assertFails(addDoc(collection(db, 'organizations', 'lila', 'events', 'e1', 'artists'),
      baseArtist({ createdBy: 'someoneelse' })))
  })

  it('12. Update sets status to invalid value — deny', async () => {
    const db = auth(env, 'u1', 'lila', 'booker').firestore()
    await assertFails(updateDoc(doc(db, 'organizations', 'lila', 'events', 'e1', 'artists', 'a1'),
      { status: 'bogus', updatedBy: 'u1' }))
  })

  it('13. Soft-deleted artist read — deny', async () => {
    const db = auth(env, 'u1', 'lila', 'booker').firestore()
    await assertFails(getDoc(doc(db, 'organizations', 'lila', 'events', 'e1', 'artists', 'gone')))
  })
})
```

- [ ] **Step 5: Add an npm script for rules tests**

In `package.json`, add to `"scripts"`:
```json
"test:rules": "vitest run tests/rules"
```

- [ ] **Step 6: Run the rules tests against the emulator**

The Firebase emulator suite must be running for `@firebase/rules-unit-testing` to attach. In one terminal:
```bash
firebase emulators:start --only firestore --project festivalmgr-dev
```

In another:
```bash
pnpm run test:rules
```
Expected: 15 tests pass (some "11.x" subcases counted).

- [ ] **Step 7: Commit**

```bash
git add layers/artists/firestore.rules.frag tests/rules/ package.json pnpm-lock.yaml
git commit -m "feat(artists): firestore rules fragment + rules-unit tests"
```

---

## Task 13: Add Firestore composite indexes for artist queries

**Files:**
- Modify: `firestore.indexes.json`

- [ ] **Step 1: Replace `firestore.indexes.json` content**

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

- [ ] **Step 2: Verify the JSON is valid**

```bash
node -e "JSON.parse(require('fs').readFileSync('firestore.indexes.json', 'utf8'))"
```
Expected: no output (valid JSON).

- [ ] **Step 3: Commit**

```bash
git add firestore.indexes.json
git commit -m "feat(artists): add three composite indexes for list/scheduling/my-artists queries"
```

---

## Task 14: Add `ArtistStatusPill` and `ArtistFilters` components + ArtistFilters tests

**Files:**
- Create: `layers/artists/components/ArtistStatusPill.vue`
- Create: `layers/artists/components/ArtistFilters.vue`
- Create: `tests/components/ArtistFilters.test.ts`

- [ ] **Step 1: Write `ArtistStatusPill.vue`**

```vue
<script setup lang="ts">
import type { ArtistStatus } from '../types'

const props = defineProps<{ status: ArtistStatus }>()

const config: Record<ArtistStatus, { label: string; color: 'gray' | 'amber' | 'green' | 'red' | 'neutral' }> = {
  planned:   { label: 'Planned',   color: 'gray' },
  inquired:  { label: 'Inquired',  color: 'amber' },
  confirmed: { label: 'Confirmed', color: 'green' },
  declined:  { label: 'Declined',  color: 'red' },
  cancelled: { label: 'Cancelled', color: 'neutral' },
}
</script>

<template>
  <UBadge :color="config[props.status].color" variant="soft">
    {{ config[props.status].label }}
  </UBadge>
</template>
```

- [ ] **Step 2: Write the failing test for `ArtistFilters`**

```ts
// tests/components/ArtistFilters.test.ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ArtistFilters from '../../layers/artists/components/ArtistFilters.vue'

describe('ArtistFilters', () => {
  it('emits update:modelValue when a status chip is toggled', async () => {
    const wrapper = mount(ArtistFilters, {
      props: {
        modelValue: { status: [], category: [] },
        availableCategories: ['Musikact', 'DJ'],
      },
      global: { stubs: { UBadge: true, UButton: true, UInput: true } },
    })
    await wrapper.get('[data-test="status-planned"]').trigger('click')
    const ev = wrapper.emitted('update:modelValue')!
    expect(ev[0][0]).toEqual({ status: ['planned'], category: [] })
  })

  it('toggle removes a status when clicked twice', async () => {
    const wrapper = mount(ArtistFilters, {
      props: {
        modelValue: { status: ['planned'], category: [] },
        availableCategories: [],
      },
      global: { stubs: { UBadge: true, UButton: true, UInput: true } },
    })
    await wrapper.get('[data-test="status-planned"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')![0][0]).toEqual({ status: [], category: [] })
  })
})
```

- [ ] **Step 3: Install `@vue/test-utils` if missing and run failing test**

```bash
pnpm add -D @vue/test-utils
pnpm exec vitest run tests/components/ArtistFilters.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 4: Write `ArtistFilters.vue`**

```vue
<script setup lang="ts">
import type { ArtistStatus } from '../types'

const props = defineProps<{
  modelValue: { status: ArtistStatus[]; category: string[] }
  availableCategories: string[]
}>()
const emit = defineEmits<{ 'update:modelValue': [value: typeof props.modelValue] }>()

const STATUSES: { id: ArtistStatus; label: string }[] = [
  { id: 'planned',   label: 'Planned' },
  { id: 'inquired',  label: 'Inquired' },
  { id: 'confirmed', label: 'Confirmed' },
  { id: 'declined',  label: 'Declined' },
  { id: 'cancelled', label: 'Cancelled' },
]

const toggleStatus = (id: ArtistStatus) => {
  const cur = props.modelValue.status
  const next = cur.includes(id) ? cur.filter((s) => s !== id) : [...cur, id]
  emit('update:modelValue', { ...props.modelValue, status: next })
}

const toggleCategory = (cat: string) => {
  const cur = props.modelValue.category
  const next = cur.includes(cat) ? cur.filter((c) => c !== cat) : [...cur, cat]
  emit('update:modelValue', { ...props.modelValue, category: next })
}
</script>

<template>
  <div class="flex flex-wrap gap-2">
    <button
      v-for="s in STATUSES"
      :key="s.id"
      :data-test="`status-${s.id}`"
      class="px-3 py-1 rounded-full border"
      :class="modelValue.status.includes(s.id) ? 'bg-primary text-white' : 'bg-transparent'"
      @click="toggleStatus(s.id)"
    >
      {{ s.label }}
    </button>

    <button
      v-for="c in availableCategories"
      :key="c"
      :data-test="`cat-${c}`"
      class="px-3 py-1 rounded-full border"
      :class="modelValue.category.includes(c) ? 'bg-primary text-white' : 'bg-transparent'"
      @click="toggleCategory(c)"
    >
      {{ c }}
    </button>
  </div>
</template>
```

- [ ] **Step 5: Run tests to verify pass**

```bash
pnpm exec vitest run tests/components/ArtistFilters.test.ts
```
Expected: 2 passed.

- [ ] **Step 6: Commit**

```bash
git add layers/artists/components/ArtistStatusPill.vue \
        layers/artists/components/ArtistFilters.vue \
        tests/components/ArtistFilters.test.ts \
        package.json pnpm-lock.yaml
git commit -m "feat(artists): ArtistStatusPill + ArtistFilters with tests"
```

---

## Task 15: Add `ArtistTable` component

**Files:**
- Create: `layers/artists/components/ArtistTable.vue`

- [ ] **Step 1: Write `ArtistTable.vue`**

```vue
<script setup lang="ts">
import type { Artist } from '../types'

interface Props {
  rows: (Artist & { id: string })[]
  template: { id: string }[]   // applicable items, used for progress fraction
}
const props = defineProps<Props>()

const STATUS_ORDER = ['planned', 'inquired', 'confirmed', 'declined', 'cancelled'] as const

const sorted = computed(() => {
  return [...props.rows].sort((a, b) => {
    const sa = STATUS_ORDER.indexOf(a.status as never)
    const sb = STATUS_ORDER.indexOf(b.status as never)
    if (sa !== sb) return sa - sb
    const ta = a.statusChangedAt?.toMillis?.() ?? 0
    const tb = b.statusChangedAt?.toMillis?.() ?? 0
    return ta - tb
  })
})

const checklistProgress = (a: Artist) => {
  const applicable = props.template.filter((t) => {
    const cfg = t as unknown as { appliesToCategories?: string[] }
    return !cfg.appliesToCategories || cfg.appliesToCategories.includes(a.category)
  })
  const done = applicable.filter((t) => a.checklist?.[t.id]?.done).length
  return `${done} / ${applicable.length}`
}
</script>

<template>
  <table class="w-full text-sm">
    <thead>
      <tr class="text-left border-b">
        <th class="py-2">Name</th>
        <th>Category</th>
        <th>Status</th>
        <th>Responsible</th>
        <th>Day</th>
        <th>Location</th>
        <th>Fee</th>
        <th>Checklist</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="a in sorted" :key="a.id" class="border-b hover:bg-gray-50">
        <td class="py-2">
          <NuxtLink :to="`./artists/${a.id}`" class="font-medium">{{ a.name }}</NuxtLink>
        </td>
        <td>{{ a.category }}</td>
        <td><ArtistStatusPill :status="a.status" /></td>
        <td>{{ a.responsibleUserId ?? '—' }}</td>
        <td>{{ a.intendedDay ?? '—' }}</td>
        <td>{{ a.intendedLocationId ?? '—' }}</td>
        <td>{{ a.fee ? `${a.fee.amount} ${a.fee.currency}` : '—' }}</td>
        <td>{{ checklistProgress(a) }}</td>
      </tr>
      <tr v-if="sorted.length === 0">
        <td colspan="8" class="py-6 text-center text-gray-400">No artists yet.</td>
      </tr>
    </tbody>
  </table>
</template>
```

- [ ] **Step 2: Verify Nuxt resolves the component**

```bash
pnpm exec nuxt prepare
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add layers/artists/components/ArtistTable.vue
git commit -m "feat(artists): ArtistTable component"
```

---

## Task 16: Add `ArtistKanban` component

**Files:**
- Create: `layers/artists/components/ArtistKanban.vue`

- [ ] **Step 1: Write `ArtistKanban.vue`**

```vue
<script setup lang="ts">
import type { Artist, ArtistStatus } from '../types'

interface Props {
  rows: (Artist & { id: string })[]
}
const props = defineProps<Props>()
const emit = defineEmits<{ 'transition-status': [artistId: string, next: ArtistStatus] }>()

const COLUMNS: ArtistStatus[] = ['planned', 'inquired', 'confirmed', 'declined', 'cancelled']

const grouped = computed(() => {
  const out = Object.fromEntries(COLUMNS.map((c) => [c, [] as typeof props.rows])) as
    Record<ArtistStatus, typeof props.rows>
  for (const r of props.rows) out[r.status]?.push(r)
  return out
})

const onDrop = (e: DragEvent, target: ArtistStatus) => {
  e.preventDefault()
  const id = e.dataTransfer?.getData('text/plain')
  if (id) emit('transition-status', id, target)
}
</script>

<template>
  <div class="grid grid-cols-5 gap-3">
    <section
      v-for="col in COLUMNS"
      :key="col"
      class="bg-gray-50 rounded p-2 min-h-[200px]"
      @dragover.prevent
      @drop="onDrop($event, col)"
    >
      <header class="font-medium uppercase text-xs mb-2"><ArtistStatusPill :status="col" /></header>
      <article
        v-for="a in grouped[col]"
        :key="a.id"
        class="bg-white rounded p-2 mb-2 border cursor-grab"
        draggable="true"
        @dragstart="(e) => e.dataTransfer?.setData('text/plain', a.id)"
      >
        <NuxtLink :to="`./artists/${a.id}`" class="font-medium block">{{ a.name }}</NuxtLink>
        <div class="text-xs text-gray-500">{{ a.category }}</div>
        <div class="text-xs">{{ a.fee ? `${a.fee.amount} ${a.fee.currency}` : '' }}</div>
      </article>
    </section>
  </div>
</template>
```

- [ ] **Step 2: Verify Nuxt resolves the component**

```bash
pnpm exec nuxt prepare
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add layers/artists/components/ArtistKanban.vue
git commit -m "feat(artists): ArtistKanban component with drag-to-transition"
```

---

## Task 17: Add `ArtistResourceLinkRow` component + tests

**Files:**
- Create: `layers/artists/components/ArtistResourceLinkRow.vue`
- Create: `tests/components/ArtistResourceLinkRow.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/components/ArtistResourceLinkRow.test.ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ArtistResourceLinkRow from '../../layers/artists/components/ArtistResourceLinkRow.vue'

describe('ArtistResourceLinkRow', () => {
  it('renders the link title and url', () => {
    const wrapper = mount(ArtistResourceLinkRow, {
      props: {
        resource: { url: 'https://drive.google.com/file/d/x', title: 'Rider', kind: 'file', addedBy: 'u', addedAt: 't' },
      },
      global: { stubs: { UButton: true } },
    })
    expect(wrapper.text()).toContain('Rider')
    expect(wrapper.html()).toContain('https://drive.google.com/file/d/x')
  })

  it('emits remove when remove button clicked', async () => {
    const wrapper = mount(ArtistResourceLinkRow, {
      props: {
        resource: { url: 'u', title: 't', kind: 'file', addedBy: 'u', addedAt: 't' },
      },
      global: { stubs: { UButton: { template: '<button data-test="remove" @click="$emit(\'click\')"><slot /></button>' } } },
    })
    await wrapper.get('[data-test="remove"]').trigger('click')
    expect(wrapper.emitted('remove')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run failing test**

```bash
pnpm exec vitest run tests/components/ArtistResourceLinkRow.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write `ArtistResourceLinkRow.vue`**

```vue
<script setup lang="ts">
import type { ResourceLink } from '../types'

defineProps<{ resource: ResourceLink }>()
defineEmits<{ remove: [] }>()
</script>

<template>
  <div class="flex items-center gap-2 py-1 border-b last:border-b-0">
    <span aria-hidden="true">{{ resource.kind === 'folder' ? '📁' : '📄' }}</span>
    <a :href="resource.url" target="_blank" rel="noopener" class="flex-1 truncate">
      {{ resource.title || resource.url }}
    </a>
    <UButton size="xs" variant="ghost" color="red" @click="$emit('remove')">Remove</UButton>
  </div>
</template>
```

- [ ] **Step 4: Run test to verify pass**

```bash
pnpm exec vitest run tests/components/ArtistResourceLinkRow.test.ts
```
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add layers/artists/components/ArtistResourceLinkRow.vue tests/components/ArtistResourceLinkRow.test.ts
git commit -m "feat(artists): ArtistResourceLinkRow component with tests"
```

---

## Task 18: Add `ArtistChecklistSection` component

**Files:**
- Create: `layers/artists/components/ArtistChecklistSection.vue`

- [ ] **Step 1: Write `ArtistChecklistSection.vue`**

```vue
<script setup lang="ts">
import type { Artist, ChecklistEntry, ResourceLink } from '../types'
import type { ChecklistItemConfig } from '~/layers/core/types'

interface Props {
  artist: Artist & { id: string }
  template: ChecklistItemConfig[]
}
const props = defineProps<Props>()
const emit = defineEmits<{
  'toggle-manual': [itemId: string, next: boolean]
  'add-resource': [itemId: string, input: { url: string; title?: string }]
  'remove-resource': [itemId: string, link: ResourceLink]
}>()

const applicable = computed(() =>
  [...props.template]
    .filter((t) => !t.appliesToCategories || t.appliesToCategories.includes(props.artist.category))
    .sort((a, b) => a.order - b.order),
)

const entry = (id: string): ChecklistEntry =>
  props.artist.checklist?.[id] ?? { done: false }

const isDone = (item: ChecklistItemConfig): boolean => {
  const e = entry(item.id)
  if (item.requirement?.type === 'resource') return (e.resources?.length ?? 0) > 0
  return e.done
}

const newUrl = ref('')
const newTitle = ref('')
const openItemId = ref<string | null>(null)

const submitResource = (itemId: string) => {
  if (!newUrl.value) return
  emit('add-resource', itemId, { url: newUrl.value, title: newTitle.value || undefined })
  newUrl.value = ''
  newTitle.value = ''
  openItemId.value = null
}
</script>

<template>
  <section class="space-y-3">
    <h3 class="font-medium">Advancing checklist</h3>
    <ul class="space-y-2">
      <li v-for="item in applicable" :key="item.id" class="border rounded p-3">
        <div class="flex items-center gap-2">
          <input
            type="checkbox"
            :checked="isDone(item)"
            :disabled="item.requirement?.type === 'resource'"
            @change="(e) => emit('toggle-manual', item.id, (e.target as HTMLInputElement).checked)"
          />
          <span class="flex-1" :class="isDone(item) ? 'line-through text-gray-400' : ''">
            {{ item.label }}
            <span v-if="item.requirement?.type === 'resource'" class="text-xs text-gray-500">
              (link a Drive resource)
            </span>
          </span>
        </div>

        <div v-if="item.requirement?.type === 'resource'" class="mt-2 pl-6 space-y-1">
          <ArtistResourceLinkRow
            v-for="(r, i) in entry(item.id).resources ?? []"
            :key="i"
            :resource="r"
            @remove="emit('remove-resource', item.id, r)"
          />
          <button
            v-if="openItemId !== item.id"
            class="text-xs text-blue-600 hover:underline"
            @click="openItemId = item.id"
          >+ Add link</button>
          <div v-else class="flex flex-col gap-1 mt-1">
            <input v-model="newUrl"   placeholder="Drive URL"        class="border rounded px-2 py-1 text-sm" />
            <input v-model="newTitle" placeholder="Title (optional)" class="border rounded px-2 py-1 text-sm" />
            <div class="flex gap-1">
              <UButton size="xs" @click="submitResource(item.id)">Save</UButton>
              <UButton size="xs" variant="ghost" @click="openItemId = null">Cancel</UButton>
            </div>
          </div>
        </div>
      </li>
      <li v-if="applicable.length === 0" class="text-sm text-gray-400">
        No checklist items configured for this category yet.
      </li>
    </ul>
  </section>
</template>
```

- [ ] **Step 2: Verify Nuxt resolves the component**

```bash
pnpm exec nuxt prepare
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add layers/artists/components/ArtistChecklistSection.vue
git commit -m "feat(artists): ArtistChecklistSection component with resource-link UX"
```

---

## Task 19: Add `ArtistDetailHeader` and `ArtistActivityList` components

**Files:**
- Create: `layers/artists/components/ArtistDetailHeader.vue`
- Create: `layers/artists/components/ArtistActivityList.vue`

- [ ] **Step 1: Write `ArtistDetailHeader.vue`**

```vue
<script setup lang="ts">
import type { Artist, ArtistStatus } from '../types'

defineProps<{ artist: Artist & { id: string } }>()
const emit = defineEmits<{ 'transition': [next: ArtistStatus] }>()
const STATUSES: ArtistStatus[] = ['planned', 'inquired', 'confirmed', 'declined', 'cancelled']
</script>

<template>
  <header class="flex items-center justify-between mb-4">
    <div>
      <h1 class="text-2xl font-semibold">{{ artist.name }}</h1>
      <div class="text-sm text-gray-500">{{ artist.category }}</div>
    </div>
    <div class="flex items-center gap-2">
      <ArtistStatusPill :status="artist.status" />
      <USelect
        :model-value="artist.status"
        :items="STATUSES"
        @update:model-value="(v: ArtistStatus) => emit('transition', v)"
      />
    </div>
  </header>
</template>
```

- [ ] **Step 2: Write `ArtistActivityList.vue`**

```vue
<script setup lang="ts">
import type { ActivityLogEntry } from '../types'

defineProps<{ entries: (ActivityLogEntry & { id: string })[] }>()

const fmt = (v: unknown): string => {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}
</script>

<template>
  <section>
    <h3 class="font-medium mb-2">Activity</h3>
    <ul class="text-sm space-y-1">
      <li v-for="e in entries" :key="e.id" class="border-b py-1">
        <span class="text-gray-500">{{ e.uid }}</span>
        changed <strong>{{ e.field }}</strong>:
        <span class="text-gray-500">{{ fmt(e.before) }}</span>
        →
        <span>{{ fmt(e.after) }}</span>
      </li>
      <li v-if="entries.length === 0" class="text-gray-400">No activity yet.</li>
    </ul>
  </section>
</template>
```

- [ ] **Step 3: Verify Nuxt resolves both**

```bash
pnpm exec nuxt prepare
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add layers/artists/components/ArtistDetailHeader.vue layers/artists/components/ArtistActivityList.vue
git commit -m "feat(artists): ArtistDetailHeader + ArtistActivityList components"
```

---

## Task 20: Add the artist list page

**Files:**
- Create: `layers/artists/pages/events/[eventId]/artists/index.vue`

- [ ] **Step 1: Write the page**

```vue
<script setup lang="ts">
import type { ArtistStatus } from '~/layers/artists/types'

definePageMeta({ middleware: 'auth' })

const route = useRoute()
const eventId = route.params.eventId as string
const { user } = useUser()
const orgId = computed(() => user.value?.activeOrgId as string)

const filter = useState(`artistListFilter:${eventId}`, () => ({
  status: [] as ArtistStatus[],
  category: [] as string[],
}))
const view = useState(`artistListView:${eventId}`, () => 'table' as 'table' | 'kanban')

const { artists, subscribe: subList } = useArtistList(orgId.value, eventId)
const { template, subscribe: subTpl } = useArtistChecklistTemplate(orgId.value, eventId)
const { transitionStatus } = useArtistMutations(orgId.value, eventId)

const { orgs } = useOrg()
const availableCategories = computed(() =>
  orgs.value.find((o) => o.id === orgId.value)?.artistCategories ?? [],
)

let listUnsub: (() => void) | undefined
let tplUnsub: (() => void) | undefined
onMounted(() => {
  listUnsub = subList()
  tplUnsub = subTpl()
})
onUnmounted(() => {
  listUnsub?.()
  tplUnsub?.()
})

const visible = computed(() => {
  return artists.value.filter((a) => {
    if (filter.value.status.length > 0 && !filter.value.status.includes(a.status)) return false
    if (filter.value.category.length > 0 && !filter.value.category.includes(a.category)) return false
    return true
  })
})
</script>

<template>
  <div class="p-4 space-y-4">
    <header class="flex items-center justify-between">
      <h1 class="text-2xl font-semibold">Artists</h1>
      <div class="flex gap-2">
        <UButton variant="ghost" :to="`./settings/artist-checklist`">Checklist settings</UButton>
        <UButton @click="$router.push(`./artists/new`)">+ Add artist</UButton>
      </div>
    </header>

    <ArtistFilters v-model="filter" :available-categories="availableCategories" />

    <div class="flex gap-2 text-sm">
      <button :class="view === 'table' ? 'font-bold' : ''" @click="view = 'table'">Table</button>
      <button :class="view === 'kanban' ? 'font-bold' : ''" @click="view = 'kanban'">Kanban</button>
    </div>

    <ArtistTable v-if="view === 'table'" :rows="visible" :template="template" />
    <ArtistKanban
      v-else
      :rows="visible"
      @transition-status="(id, next) => transitionStatus(id, next)"
    />
  </div>
</template>
```

- [ ] **Step 2: Verify Nuxt builds**

```bash
pnpm exec nuxt prepare
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add layers/artists/pages/events/[eventId]/artists/index.vue
git commit -m "feat(artists): artist list page with table/kanban views and filters"
```

---

## Task 21: Add the artist detail page

**Files:**
- Create: `layers/artists/pages/events/[eventId]/artists/[artistId].vue`

- [ ] **Step 1: Write the page**

```vue
<script setup lang="ts">
import type { Artist, ArtistStatus, ResourceLink } from '~/layers/artists/types'

definePageMeta({ middleware: 'auth' })

const route = useRoute()
const eventId = route.params.eventId as string
const artistId = route.params.artistId as string

const { user } = useUser()
const orgId = computed(() => user.value?.activeOrgId as string)

const isCreate = artistId === 'new'
const draft = ref<Pick<Artist, 'name' | 'category'>>({ name: '', category: '' })

const { artist, subscribe: subArtist } = useArtist(orgId.value, eventId, isCreate ? '' : artistId)
const { template, subscribe: subTpl } = useArtistChecklistTemplate(orgId.value, eventId)
const { entries, subscribe: subActivity, logChange } = useArtistActivity(orgId.value, eventId, artistId)
const { createArtist, updateArtist, transitionStatus, softDeleteArtist } = useArtistMutations(orgId.value, eventId)
const { addResourceToTask, removeResourceFromTask } = useArtistResources(orgId.value, eventId)

let artistUnsub: (() => void) | undefined
let tplUnsub: (() => void) | undefined
let activityUnsub: (() => void) | undefined
onMounted(() => {
  if (!isCreate) {
    artistUnsub = subArtist()
    activityUnsub = subActivity(20)
  }
  tplUnsub = subTpl()
})
onUnmounted(() => {
  artistUnsub?.(); tplUnsub?.(); activityUnsub?.()
})

const onCreate = async () => {
  if (!draft.value.name || !draft.value.category) return
  const ref = await createArtist(draft.value)
  navigateTo(`./${ref.id}`)
}

const patchField = async (field: keyof Artist, value: unknown) => {
  if (!artist.value) return
  const before = (artist.value as Record<string, unknown>)[field]
  await updateArtist(artist.value.id, { [field]: value } as Partial<Artist>)
  await logChange(field as string, before, value)
}

const onTransition = async (next: ArtistStatus) => {
  if (!artist.value) return
  const before = artist.value.status
  await transitionStatus(artist.value.id, next)
  await logChange('status', before, next)
}

const onToggleManual = async (itemId: string, next: boolean) => {
  if (!artist.value) return
  const before = artist.value.checklist?.[itemId]?.done ?? false
  await updateArtist(artist.value.id, {
    checklist: {
      ...artist.value.checklist,
      [itemId]: {
        ...(artist.value.checklist?.[itemId] ?? {}),
        done: next,
        doneAt: next ? new Date() as never : undefined,
        doneBy: next ? user.value?.uid : undefined,
      },
    },
  } as Partial<Artist>)
  await logChange(`checklist.${itemId}.done`, before, next)
}
</script>

<template>
  <div class="p-4 max-w-3xl mx-auto">
    <div v-if="isCreate" class="space-y-3">
      <h1 class="text-2xl font-semibold">Add artist</h1>
      <UInput v-model="draft.name"     placeholder="Name" />
      <UInput v-model="draft.category" placeholder="Category" />
      <UButton :disabled="!draft.name || !draft.category" @click="onCreate">Create</UButton>
    </div>

    <div v-else-if="artist" class="space-y-6">
      <ArtistDetailHeader :artist="artist" @transition="onTransition" />

      <section>
        <h3 class="font-medium mb-2">Identity</h3>
        <UInput :model-value="artist.name"             @blur="(e: any) => patchField('name', e.target.value)" />
        <UInput :model-value="artist.category"         @blur="(e: any) => patchField('category', e.target.value)" />
        <UInput :model-value="artist.origin ?? ''"     @blur="(e: any) => patchField('origin', e.target.value)" placeholder="Origin" />
        <UTextarea :model-value="artist.shortDescription ?? ''"
          @blur="(e: any) => patchField('shortDescription', e.target.value)" placeholder="Short description" />
      </section>

      <section>
        <h3 class="font-medium mb-2">Deal</h3>
        <UInput
          type="number"
          :model-value="artist.fee?.amount ?? ''"
          placeholder="Fee amount"
          @blur="(e: any) => patchField('fee', { amount: Number(e.target.value), currency: artist.fee?.currency || 'CHF' })"
        />
        <UInput
          type="number"
          :model-value="artist.travelBudget?.amount ?? ''"
          placeholder="Travel budget"
          @blur="(e: any) => patchField('travelBudget', { amount: Number(e.target.value), currency: artist.travelBudget?.currency || 'CHF' })"
        />
        <UInput :model-value="artist.accommodation ?? ''"
          @blur="(e: any) => patchField('accommodation', e.target.value)" placeholder="Accommodation (free text)" />
        <UTextarea :model-value="artist.dealNotes ?? ''"
          @blur="(e: any) => patchField('dealNotes', e.target.value)" placeholder="Deal notes / negotiation log" />
      </section>

      <section>
        <h3 class="font-medium mb-2">Performance</h3>
        <UInput type="date"   :model-value="artist.intendedDay ?? ''"
          @blur="(e: any) => patchField('intendedDay', e.target.value)" />
        <UInput type="number" :model-value="artist.performanceDurationMin ?? ''"
          @blur="(e: any) => patchField('performanceDurationMin', Number(e.target.value))" placeholder="Duration (min)" />
        <UInput :model-value="artist.performanceNote ?? ''"
          @blur="(e: any) => patchField('performanceNote', e.target.value)" placeholder="Performance note" />
      </section>

      <ArtistChecklistSection
        :artist="artist"
        :template="template"
        @toggle-manual="(id, next) => onToggleManual(id, next)"
        @add-resource="(id, input) => addResourceToTask(artist.id, id, input)"
        @remove-resource="(id, link) => removeResourceFromTask(artist.id, id, link)"
      />

      <section>
        <h3 class="font-medium mb-2">Comment</h3>
        <UTextarea :model-value="artist.comment ?? ''"
          @blur="(e: any) => patchField('comment', e.target.value)" />
      </section>

      <ArtistActivityList :entries="entries" />

      <UButton variant="ghost" color="red" @click="softDeleteArtist(artist.id)">Delete artist</UButton>
    </div>

    <div v-else class="text-gray-500">Loading…</div>
  </div>
</template>
```

- [ ] **Step 2: Verify Nuxt builds**

```bash
pnpm exec nuxt prepare
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add layers/artists/pages/events/[eventId]/artists/[artistId].vue
git commit -m "feat(artists): artist detail page with inline editing"
```

---

## Task 22: Add the checklist template editor page

**Files:**
- Create: `layers/artists/components/ChecklistTemplateEditor.vue`
- Create: `layers/artists/pages/events/[eventId]/settings/artist-checklist.vue`

- [ ] **Step 1: Write `ChecklistTemplateEditor.vue`**

```vue
<script setup lang="ts">
import type { ChecklistItemConfig } from '~/layers/core/types'

const props = defineProps<{
  modelValue: ChecklistItemConfig[]
  availableCategories: string[]
}>()
const emit = defineEmits<{ 'update:modelValue': [value: ChecklistItemConfig[]] }>()

const list = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const addItem = () => {
  list.value = [
    ...list.value,
    { id: `item-${Date.now()}`, label: 'New item', order: (list.value.at(-1)?.order ?? 0) + 10 },
  ]
}

const removeItem = (id: string) => {
  list.value = list.value.filter((i) => i.id !== id)
}

const updateItem = (id: string, patch: Partial<ChecklistItemConfig>) => {
  list.value = list.value.map((i) => (i.id === id ? { ...i, ...patch } : i))
}

const move = (id: string, dir: -1 | 1) => {
  const idx = list.value.findIndex((i) => i.id === id)
  if (idx < 0) return
  const swap = idx + dir
  if (swap < 0 || swap >= list.value.length) return
  const next = [...list.value]
  ;[next[idx], next[swap]] = [next[swap], next[idx]]
  list.value = next.map((i, n) => ({ ...i, order: (n + 1) * 10 }))
}
</script>

<template>
  <div class="space-y-2">
    <ul>
      <li v-for="i in list" :key="i.id" class="border rounded p-3 mb-2 space-y-2">
        <div class="flex items-center gap-2">
          <UInput :model-value="i.label" @blur="(e: any) => updateItem(i.id, { label: e.target.value })" />
          <UButton size="xs" variant="ghost" @click="move(i.id, -1)">↑</UButton>
          <UButton size="xs" variant="ghost" @click="move(i.id,  1)">↓</UButton>
          <UButton size="xs" variant="ghost" color="red" @click="removeItem(i.id)">Remove</UButton>
        </div>
        <UTextarea :model-value="i.description ?? ''"
          placeholder="Description (optional)"
          @blur="(e: any) => updateItem(i.id, { description: e.target.value || undefined })" />
        <label class="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            :checked="i.requirement?.type === 'resource'"
            @change="(e) => updateItem(i.id, {
              requirement: (e.target as HTMLInputElement).checked ? { type: 'resource' } : undefined,
            })"
          />
          Requires linked Drive resource
        </label>
        <label class="block text-xs text-gray-500">Applies to categories (blank = all):
          <UInput
            :model-value="(i.appliesToCategories ?? []).join(', ')"
            placeholder="Musikact, DJ"
            @blur="(e: any) => {
              const v = (e.target.value as string).split(',').map((s) => s.trim()).filter(Boolean)
              updateItem(i.id, { appliesToCategories: v.length ? v : undefined })
            }"
          />
        </label>
      </li>
    </ul>
    <UButton @click="addItem">+ Add item</UButton>
  </div>
</template>
```

- [ ] **Step 2: Write the settings page `pages/events/[eventId]/settings/artist-checklist.vue`**

```vue
<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const route = useRoute()
const eventId = route.params.eventId as string
const { user } = useUser()
const orgId = computed(() => user.value?.activeOrgId as string)

const { template, subscribe, saveTemplate } = useArtistChecklistTemplate(orgId.value, eventId)
const draft = ref<typeof template.value>([])
const dirty = ref(false)

let unsub: (() => void) | undefined
onMounted(() => {
  unsub = subscribe()
  watchEffect(() => {
    if (!dirty.value) draft.value = JSON.parse(JSON.stringify(template.value))
  })
})
onUnmounted(() => unsub?.())

const onUpdate = (next: typeof template.value) => {
  draft.value = next
  dirty.value = true
}

const onSave = async () => {
  await saveTemplate(draft.value)
  dirty.value = false
}

const { orgs } = useOrg()
const availableCategories = computed(() =>
  orgs.value.find((o) => o.id === orgId.value)?.artistCategories ?? [],
)
</script>

<template>
  <div class="p-4 max-w-3xl mx-auto space-y-4">
    <h1 class="text-2xl font-semibold">Artist checklist template</h1>
    <p class="text-sm text-gray-500">Configure the advancing checklist for this event. Items are inherited by every artist.</p>
    <ChecklistTemplateEditor
      :model-value="draft"
      :available-categories="availableCategories"
      @update:model-value="onUpdate"
    />
    <div class="flex gap-2">
      <UButton :disabled="!dirty" @click="onSave">Save</UButton>
      <UButton variant="ghost" :disabled="!dirty"
        @click="() => { draft = JSON.parse(JSON.stringify(template)); dirty = false }">Discard</UButton>
    </div>
  </div>
</template>
```

- [ ] **Step 3: Verify Nuxt builds**

```bash
pnpm exec nuxt prepare
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add layers/artists/components/ChecklistTemplateEditor.vue \
        layers/artists/pages/events/[eventId]/settings/artist-checklist.vue
git commit -m "feat(artists): checklist template editor page and component"
```

---

## Task 23: Add per-org artist categories editor in core settings

**Files:**
- Create: `layers/core/pages/settings/categories.vue`

- [ ] **Step 1: Write the page**

```vue
<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const { user } = useUser()
const { orgs, updateOrg } = useOrg()

const orgId = computed(() => user.value?.activeOrgId as string)
const org = computed(() => orgs.value.find((o) => o.id === orgId.value))
const draft = ref<string>('')
watchEffect(() => { draft.value = (org.value?.artistCategories ?? []).join('\n') })

const onSave = async () => {
  if (!org.value) return
  const cats = draft.value.split('\n').map((s) => s.trim()).filter(Boolean)
  await updateOrg(org.value.id, { artistCategories: cats })
}
</script>

<template>
  <div class="p-4 max-w-xl mx-auto space-y-4">
    <h1 class="text-2xl font-semibold">Artist categories</h1>
    <p class="text-sm text-gray-500">One per line. Used as suggestions in the artist editor; categories on existing artists are not changed when you remove a value here.</p>
    <UTextarea v-model="draft" rows="10" placeholder="Musikact&#10;DJ&#10;Drag&#10;..." />
    <UButton @click="onSave">Save</UButton>
  </div>
</template>
```

- [ ] **Step 2: Verify `useOrg` exposes `updateOrg`** (added in Plan A Task 7)

If it doesn't, add it now to `layers/core/composables/useOrg.ts`:
```ts
const updateOrg = (orgId: string, patch: Partial<Organization>) =>
  updateDoc(doc(db, 'organizations', orgId), patch)
```
and re-export it. The function signature must match what the page uses.

- [ ] **Step 3: Verify Nuxt builds**

```bash
pnpm exec nuxt prepare
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add layers/core/pages/settings/categories.vue layers/core/composables/useOrg.ts
git commit -m "feat(core): per-org artist categories editor"
```

---

## Task 24: Add emulator seed script for sample artists

**Files:**
- Create: `scripts/seed-artists.ts`
- Modify: `package.json` (add `seed:artists` script)

- [ ] **Step 1: Write `scripts/seed-artists.ts`**

```ts
// scripts/seed-artists.ts
// Run with: pnpm tsx scripts/seed-artists.ts
// Requires: emulator running, FIREBASE_USE_EMULATOR=1, an existing org `lila` and event `lila-2025` (created by seed-director).

import { initializeApp } from 'firebase/app'
import {
  collection, doc, setDoc, getFirestore, connectFirestoreEmulator, serverTimestamp, Timestamp,
} from 'firebase/firestore'

const app = initializeApp({ projectId: 'festivalmgr-dev', apiKey: 'fake' })
const db = getFirestore(app)
connectFirestoreEmulator(db, 'localhost', 8080)

const ORG = 'lila'
const EVENT = 'lila-2025'
const ME = 'seed'

const samples = [
  { id: 'arxx',     name: 'ARXX',          category: 'Musikact', status: 'confirmed', fee: 4000, intendedDay: '2025-09-06' },
  { id: 'dornika',  name: 'Dornika',       category: 'Musikact', status: 'confirmed', fee: 2000, intendedDay: '2025-09-05' },
  { id: 'jasmine',  name: 'Jasmine.4.t',   category: 'Musikact', status: 'confirmed', fee: 3000, intendedDay: '2025-09-04' },
  { id: 'tx2',      name: 'TX2',           category: 'Musikact', status: 'inquired',  fee: 4000 },
  { id: 'ablexu',   name: 'Ablexu',        category: 'Musikact', status: 'planned',   fee: 500  },
  { id: 'bonym',    name: 'BONY.m.Æss',    category: 'DJ',       status: 'confirmed', fee: 300  },
  { id: 'obsidian', name: 'Obsidian',      category: 'DJ',       status: 'confirmed', fee: 300  },
  { id: 'ginger',   name: 'The Ginger Lash',category: 'DJ',      status: 'confirmed', fee: 300  },
  { id: 'kinnari',  name: 'Kinnari',       category: 'Dancer',   status: 'confirmed', fee: 0    },
  { id: 'gino',     name: 'Gino & Johannes',category: 'Karaoke', status: 'declined',  fee: 0    },
] as const

;(async () => {
  for (const s of samples) {
    await setDoc(doc(db, 'organizations', ORG, 'events', EVENT, 'artists', s.id), {
      name: s.name,
      category: s.category,
      links: {},
      status: s.status,
      statusChangedAt: Timestamp.now(),
      responsibleUserId: ME,
      fee: s.fee ? { amount: s.fee, currency: 'CHF' } : undefined,
      intendedDay: 'intendedDay' in s ? s.intendedDay : undefined,
      checklist: {},
      createdAt: Timestamp.now(),
      createdBy: ME,
      updatedAt: Timestamp.now(),
      updatedBy: ME,
      deletedAt: null,
    })
  }
  console.log(`Seeded ${samples.length} artists into ${ORG}/${EVENT}.`)
  process.exit(0)
})().catch((e) => { console.error(e); process.exit(1) })
```

- [ ] **Step 2: Add the npm script in `package.json`**

In `"scripts"`:
```json
"seed:artists": "FIREBASE_USE_EMULATOR=1 tsx scripts/seed-artists.ts"
```

If `tsx` is not yet a dev dependency:
```bash
pnpm add -D tsx
```

- [ ] **Step 3: Run the seed against the emulator**

In one terminal:
```bash
firebase emulators:start --only firestore --project festivalmgr-dev
```
In another (after seeding the org and event via Plan A's `seed-director` script):
```bash
pnpm run seed:artists
```
Expected: `Seeded 10 artists into lila/lila-2025.`

- [ ] **Step 4: Commit**

```bash
git add scripts/seed-artists.ts package.json pnpm-lock.yaml
git commit -m "feat(artists): emulator seed script with 10 sample artists"
```

---

## Task 25: End-to-end smoke test (manual)

**Files:** none (runtime verification).

- [ ] **Step 1: Start the emulator + Nuxt dev server**

```bash
pnpm run dev
```
Expected: emulator UI on :4000, Nuxt on :3000.

- [ ] **Step 2: Sign in as seeded director and reach `/events/lila-2025/artists`**

Verify:
- The list shows all 10 seeded artists.
- Status filter chips reduce the table.
- Switching to Kanban groups the artists correctly across 5 columns.
- Drag-drop a Kanban card to a different column updates the artist's status.

- [ ] **Step 3: Open one artist's detail page**

Verify:
- Identity / Deal / Performance / Checklist / Comment / Activity sections render.
- Editing the fee on blur persists (refresh confirms).
- Status changer in the header updates the badge and writes an Activity row.
- Adding a Drive URL to "Tech rider received" auto-checks the item.
- Manually checking "Promo material received" persists across refresh.

- [ ] **Step 4: Configure the checklist template**

Visit `/events/lila-2025/settings/artist-checklist`, add a new item with `appliesToCategories: ['DJ']`, save. Open a `DJ` artist — new item appears; open a `Musikact` artist — new item is hidden.

- [ ] **Step 5: Configure org artist categories**

Visit `/settings/categories`, add `Musikact, DJ, Dancer, Drag, Karaoke, Comedy`, save. Reload the artist list — category filter chips show the configured categories.

- [ ] **Step 6: Soft-delete an artist**

Open detail page, click Delete. Verify the artist disappears from the list and detail page reads "Loading…" indefinitely (soft-deleted reads denied by rules).

- [ ] **Step 7: Document anything broken** in a GitHub issue / TODO file before declaring done.

- [ ] **Step 8: Commit a smoke-test marker file (optional, only if you want it on record)**

If anything was fixed during smoke testing, those fixes will already be in earlier-task commits. No additional commit is required for this task.

---

## Self-Review

**Spec coverage check:**

| Spec section | Implemented in |
|---|---|
| §3 Status state machine (planned/inquired/confirmed/declined/cancelled) | Task 4 (types), Task 7 (transitionStatus), Task 14 (StatusPill), Task 19 (header) |
| §5 Artist data model | Task 4 (types) |
| §5 Activity log subcollection | Task 11 (composable), Task 19 (component), Task 21 (page wiring) |
| §5 Indexes | Task 13 |
| §6 Default checklist seed | Task 2 |
| §6 Configurable per-event template | Task 9 (composable), Task 22 (editor page + component) |
| §6 Resource-link UX + auto-satisfaction | Task 8 (composable), Task 17 (link row), Task 18 (checklist section) |
| §6 `appliesToCategories` filtering | Task 18 (`applicable` computed) |
| §7 Artists → Schedule integration | Task 4 (types: `intendedDay`, `intendedLocationId`) — Schedule's reads come in its own plan |
| §7 Artists → Budget rollup | Task 10 |
| §9a Artist list (table + kanban + filters) | Tasks 14, 15, 16, 20 |
| §9b Artist detail | Task 21 |
| §9c Checklist settings | Task 22 |
| §9 Per-org category editor | Task 23 |
| §10 Rules fragment + tests (table 1–13) | Task 12 |
| §10 Activity rules | Task 12 |
| §12 Emulator seed | Task 24 |
| §12 End-to-end smoke | Task 25 |

**Forward-compat hooks (§11):** `customAttributes` map present in the type (Task 4); offer-history subcollection / file uploads / share-links / crew mirror / workflow enforcement are explicitly deferred.

**Placeholder scan:** no TBDs, TODOs, "implement later", "similar to Task N", or "add validation" phrasing in the plan body.

**Type consistency:** signatures match — `useArtistMutations(orgId, eventId)` everywhere; `transitionStatus(artistId, next)` in mutation tests / Kanban / detail page; resource link shape `{url, title?, kind?, addedBy, addedAt}` consistent across types, composable, components, tests, and seed.
