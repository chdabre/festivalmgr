# Artist Module — C2: UI (List + Detail) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the artist list page (table view + filters + add-artist modal) and the artist detail page (7 inline-edited sections + status changer + activity log + soft-delete) on top of the C1 data layer. Kanban deferred; settings → C3.

**Architecture:** New `layers/artists/app/components/` (7 single-purpose Vue 3 SFCs) + new `layers/artists/app/pages/events/[eventId]/artists/{index,[artistId]}.vue` pages. Pages compose C1's composables (`useArtistList`, `useArtist`, `useArtistMutations`, `useArtistResources`, `useArtistChecklistTemplate`, `useArtistActivity`) and core's `useOrg`, `useEvent`, `useLocations`. Inline-edit pattern uses a tiny `useDebouncedFn` helper (4 lines, no library dep). One new core composable `useUserById` is added for display-name lookup on the responsible-user cell.

**Tech Stack:** Nuxt 4, Nuxt UI v4 (auto-imported global components — `UCard`, `UModal`, `UFormField`, `UInput`, `UTextarea`, `USelect`, `UButton`, `UBadge`, `UCheckbox`, `UAlert`), Vue 3 `<script setup lang="ts">`, vuefire (existing patterns), `@vue/test-utils` 2.x for component unit tests, Vitest 2.x.

**Spec:** [docs/superpowers/specs/2026-05-09-artists-c2-ui-design.md](../specs/2026-05-09-artists-c2-ui-design.md)

**Prerequisites (already on `main`):**
- C1 data layer merged: all 7 artist composables, `Artist` / `ArtistStatus` / `ChecklistEntry` / `ResourceLink` types, role-scoped Firestore rules.
- Plan A: AppShell, vuefire wiring, `useOrg`, `useEvent`, `useLocations`, magic-link auth.
- SSR claims fix: `useFmgrClaims`, no-flicker `useOrg`.

**Out of scope (deferred):**
- Kanban view (no drag-and-drop library work).
- Quick-edit cells in the table — row click opens detail; one edit surface.
- Member directory / responsible-user picker — view only in v1.
- Checklist template settings page → C3.
- Per-org categories editor → C3.
- Sample artists seed → C4.

---

## File Structure (created or modified in this plan)

```
festivalmgr/
├── layers/
│   ├── core/
│   │   └── app/composables/
│   │       └── useUserById.ts                                 [NEW]
│   └── artists/
│       └── app/
│           ├── composables/
│           │   └── useDebouncedFn.ts                           [NEW]
│           ├── components/
│           │   ├── ArtistStatusPill.vue                        [NEW]
│           │   ├── ArtistFilters.vue                           [NEW]
│           │   ├── ArtistTable.vue                             [NEW]
│           │   ├── ArtistDetailHeader.vue                      [NEW]
│           │   ├── ArtistChecklistSection.vue                  [NEW]
│           │   ├── ArtistResourceLinkRow.vue                   [NEW]
│           │   └── ArtistActivityList.vue                      [NEW]
│           └── pages/events/[eventId]/artists/
│               ├── index.vue                                   [NEW: list page]
│               └── [artistId].vue                              [NEW: detail page]
└── tests/
    ├── composables/
    │   ├── useUserById.test.ts                                 [NEW]
    │   └── useDebouncedFn.test.ts                              [NEW]
    └── components/
        ├── ArtistStatusPill.test.ts                            [NEW]
        ├── ArtistFilters.test.ts                               [NEW]
        └── ArtistResourceLinkRow.test.ts                       [NEW]
```

---

## Task 1: `useUserById` core composable + tests

**Files:**
- Create: `layers/core/app/composables/useUserById.ts`
- Create: `tests/composables/useUserById.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/composables/useUserById.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'

const docMock = vi.fn((..._a: unknown[]) => ({ kind: 'doc', args: _a }))

vi.mock('firebase/firestore', () => ({
  doc: (...a: unknown[]) => docMock(...a),
}))
vi.mock('vuefire', () => ({
  useFirestore: () => ({}),
  useDocument: vi.fn((refOrComputed: unknown) => {
    const v = (refOrComputed as { value?: unknown }).value
    if (!v) return ref(null)
    return ref({ email: 'd@example.com', displayName: 'Director', orgIds: ['lila'] })
  }),
}))

import { useUserById } from '#layers/core/app/composables/useUserById'

describe('useUserById', () => {
  it('returns the user doc when uid is provided', () => {
    const u = useUserById('dirA')
    expect(docMock).toHaveBeenCalledWith({}, 'users', 'dirA')
    expect(u.value?.displayName).toBe('Director')
  })

  it('returns null when uid is null/undefined', () => {
    const u = useUserById(null)
    expect(u.value).toBeNull()
  })
})
```

- [ ] **Step 2: Run, expect failure**

```bash
pnpm test --reporter=verbose tests/composables/useUserById.test.ts 2>&1 | tail -5
```

- [ ] **Step 3: Write the composable**

```ts
// layers/core/app/composables/useUserById.ts
import { computed } from 'vue'
import { useDocument, useFirestore } from 'vuefire'
import { doc } from 'firebase/firestore'
import type { User } from '#layers/core/shared/types'

/**
 * Read a global user profile by uid. Returns vuefire's `Ref<User | null>`
 * — null while loading or if the doc doesn't exist (e.g., a uid from a
 * deleted user). Cross-tenant lookups deny per the rules at users/{uid}.
 */
export function useUserById(uid: string | null | undefined) {
  const db = useFirestore()
  const docRef = computed(() => uid ? doc(db, 'users', uid) : null)
  return useDocument<User>(docRef)
}
```

- [ ] **Step 4: Run, expect pass**

```bash
pnpm test --reporter=verbose tests/composables/useUserById.test.ts 2>&1 | tail -5
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add layers/core/app/composables/useUserById.ts tests/composables/useUserById.test.ts
git commit -m "feat(core): add useUserById composable for arbitrary user lookups"
```

---

## Task 2: `useDebouncedFn` utility + tests

**Files:**
- Create: `layers/artists/app/composables/useDebouncedFn.ts`
- Create: `tests/composables/useDebouncedFn.test.ts`

Tiny utility for the detail-page inline edits.

- [ ] **Step 1: Write the failing test**

Create `tests/composables/useDebouncedFn.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('vue', async () => {
  const actual = await vi.importActual<typeof import('vue')>('vue')
  return { ...actual, onScopeDispose: vi.fn() }
})

import { useDebouncedFn } from '#layers/artists/app/composables/useDebouncedFn'

describe('useDebouncedFn', () => {
  it('delays the underlying call until the wait elapses', async () => {
    vi.useFakeTimers()
    const inner = vi.fn()
    const debounced = useDebouncedFn(inner, 100)
    debounced('a')
    debounced('b')
    debounced('c')
    expect(inner).not.toHaveBeenCalled()
    vi.advanceTimersByTime(100)
    expect(inner).toHaveBeenCalledTimes(1)
    expect(inner).toHaveBeenCalledWith('c')
    vi.useRealTimers()
  })

  it('coalesces multiple calls into one with the latest args', async () => {
    vi.useFakeTimers()
    const inner = vi.fn()
    const debounced = useDebouncedFn(inner, 50)
    debounced(1, 'x')
    vi.advanceTimersByTime(20)
    debounced(2, 'y')
    vi.advanceTimersByTime(50)
    expect(inner).toHaveBeenCalledTimes(1)
    expect(inner).toHaveBeenCalledWith(2, 'y')
    vi.useRealTimers()
  })
})
```

- [ ] **Step 2: Run, expect failure**

```bash
pnpm test --reporter=verbose tests/composables/useDebouncedFn.test.ts 2>&1 | tail -5
```

- [ ] **Step 3: Write the utility**

```ts
// layers/artists/app/composables/useDebouncedFn.ts
import { onScopeDispose } from 'vue'

/**
 * Trailing-edge debounce. Calls the wrapped function once after `ms`
 * milliseconds of inactivity, with the most recent arguments. Cleans
 * up the pending timer when the surrounding effect scope disposes.
 */
export function useDebouncedFn<Args extends unknown[]>(
  fn: (...args: Args) => unknown,
  ms: number,
) {
  let timer: ReturnType<typeof setTimeout> | null = null
  onScopeDispose(() => { if (timer) clearTimeout(timer) })
  return (...args: Args) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { fn(...args) }, ms)
  }
}
```

- [ ] **Step 4: Run, expect pass**

```bash
pnpm test --reporter=verbose tests/composables/useDebouncedFn.test.ts 2>&1 | tail -5
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add layers/artists/app/composables/useDebouncedFn.ts tests/composables/useDebouncedFn.test.ts
git commit -m "feat(artists): add useDebouncedFn helper for inline-edit writes"
```

---

## Task 3: `ArtistStatusPill` component + test

**Files:**
- Create: `layers/artists/app/components/ArtistStatusPill.vue`
- Create: `tests/components/ArtistStatusPill.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/components/ArtistStatusPill.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ArtistStatusPill from '#layers/artists/app/components/ArtistStatusPill.vue'

describe('ArtistStatusPill', () => {
  const cases: Array<[string, string, string]> = [
    ['planned',   'neutral',  'Planned'],
    ['inquired',  'info',     'Inquired'],
    ['confirmed', 'success',  'Confirmed'],
    ['declined',  'error',    'Declined'],
    ['cancelled', 'warning',  'Cancelled'],
  ]

  // Stub <UBadge> so we can assert color + label without a full Nuxt UI mount.
  const stubs = {
    UBadge: {
      props: ['color'],
      template: '<span :data-color="color"><slot /></span>',
    },
  }

  for (const [status, color, label] of cases) {
    it(`renders ${status} with color ${color} and label "${label}"`, () => {
      const w = mount(ArtistStatusPill, { props: { status }, global: { stubs } })
      expect(w.find('span').attributes('data-color')).toBe(color)
      expect(w.text()).toBe(label)
    })
  }
})
```

- [ ] **Step 2: Run, expect failure**

```bash
pnpm test --reporter=verbose tests/components/ArtistStatusPill.test.ts 2>&1 | tail -10
```

Expected: FAIL — module `#layers/artists/app/components/ArtistStatusPill.vue` doesn't exist.

- [ ] **Step 3: Write the component**

```vue
<!-- layers/artists/app/components/ArtistStatusPill.vue -->
<script setup lang="ts">
import type { ArtistStatus } from '#layers/artists/shared/types'

const props = defineProps<{
  status: ArtistStatus
}>()

const config: Record<ArtistStatus, { color: 'neutral' | 'info' | 'success' | 'error' | 'warning'; label: string }> = {
  planned:   { color: 'neutral', label: 'Planned' },
  inquired:  { color: 'info',    label: 'Inquired' },
  confirmed: { color: 'success', label: 'Confirmed' },
  declined:  { color: 'error',   label: 'Declined' },
  cancelled: { color: 'warning', label: 'Cancelled' },
}

const c = computed(() => config[props.status])
</script>

<template>
  <UBadge :color="c.color" variant="subtle" size="sm">{{ c.label }}</UBadge>
</template>
```

- [ ] **Step 4: Run, expect pass**

```bash
pnpm test --reporter=verbose tests/components/ArtistStatusPill.test.ts 2>&1 | tail -10
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add layers/artists/app/components/ArtistStatusPill.vue tests/components/ArtistStatusPill.test.ts
git commit -m "feat(artists): add ArtistStatusPill component + tests"
```

---

## Task 4: `ArtistFilters` component + test

**Files:**
- Create: `layers/artists/app/components/ArtistFilters.vue`
- Create: `tests/components/ArtistFilters.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/components/ArtistFilters.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ArtistFilters from '#layers/artists/app/components/ArtistFilters.vue'

const stubs = {
  // Render UButton as <button> so we can click and read text.
  UButton: {
    props: ['color', 'variant'],
    template: '<button :data-color="color" :data-variant="variant" v-bind="$attrs"><slot /></button>',
    inheritAttrs: false,
  },
  UInput: {
    props: ['modelValue', 'placeholder'],
    emits: ['update:modelValue'],
    template: `<input :value="modelValue" :placeholder="placeholder" @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)" />`,
  },
}

describe('ArtistFilters', () => {
  it('toggling a status chip emits update:modelValue with the status added', async () => {
    const w = mount(ArtistFilters, {
      props: { modelValue: { status: [] }, availableCategories: [] },
      global: { stubs },
    })
    const plannedBtn = w.findAll('button').find((b) => b.text() === 'Planned')!
    await plannedBtn.trigger('click')
    expect(w.emitted('update:modelValue')).toBeTruthy()
    const last = w.emitted('update:modelValue')!.at(-1)![0]
    expect((last as { status: string[] }).status).toEqual(['planned'])
  })

  it('toggling an already-selected status chip removes it', async () => {
    const w = mount(ArtistFilters, {
      props: { modelValue: { status: ['planned', 'inquired'] }, availableCategories: [] },
      global: { stubs },
    })
    const plannedBtn = w.findAll('button').find((b) => b.text() === 'Planned')!
    await plannedBtn.trigger('click')
    const last = w.emitted('update:modelValue')!.at(-1)![0]
    expect((last as { status: string[] }).status).toEqual(['inquired'])
  })

  it('renders one button per available category and toggles selection', async () => {
    const w = mount(ArtistFilters, {
      props: { modelValue: { category: [] }, availableCategories: ['Musikact', 'Theater'] },
      global: { stubs },
    })
    const theaterBtn = w.findAll('button').find((b) => b.text() === 'Theater')!
    await theaterBtn.trigger('click')
    const last = w.emitted('update:modelValue')!.at(-1)![0]
    expect((last as { category: string[] }).category).toEqual(['Theater'])
  })

  it('search input emits update:search', async () => {
    const w = mount(ArtistFilters, {
      props: { modelValue: {}, availableCategories: [], search: '' },
      global: { stubs },
    })
    const input = w.find('input')
    await input.setValue('arxx')
    expect(w.emitted('update:search')).toBeTruthy()
    expect(w.emitted('update:search')!.at(-1)![0]).toBe('arxx')
  })
})
```

- [ ] **Step 2: Run, expect failure**

```bash
pnpm test --reporter=verbose tests/components/ArtistFilters.test.ts 2>&1 | tail -10
```

- [ ] **Step 3: Write the component**

```vue
<!-- layers/artists/app/components/ArtistFilters.vue -->
<script setup lang="ts">
import type { ArtistListFilter } from '#layers/artists/app/composables/useArtistList'
import type { ArtistStatus } from '#layers/artists/shared/types'

const props = defineProps<{
  modelValue: ArtistListFilter
  availableCategories: string[]
  search?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [filter: ArtistListFilter]
  'update:search': [value: string]
}>()

const STATUSES: { value: ArtistStatus; label: string }[] = [
  { value: 'planned',   label: 'Planned' },
  { value: 'inquired',  label: 'Inquired' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'declined',  label: 'Declined' },
  { value: 'cancelled', label: 'Cancelled' },
]

function toggle<T>(list: T[] | undefined, value: T): T[] {
  const cur = list ?? []
  return cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value]
}

function onStatusClick(s: ArtistStatus) {
  emit('update:modelValue', { ...props.modelValue, status: toggle(props.modelValue.status, s) })
}

function onCategoryClick(c: string) {
  emit('update:modelValue', { ...props.modelValue, category: toggle(props.modelValue.category, c) })
}

function isStatusActive(s: ArtistStatus) {
  return (props.modelValue.status ?? []).includes(s)
}

function isCategoryActive(c: string) {
  return (props.modelValue.category ?? []).includes(c)
}

function onSearchInput(v: string) {
  emit('update:search', v)
}
</script>

<template>
  <div class="flex flex-col gap-3 mb-4">
    <div class="flex flex-wrap gap-2 items-center">
      <span class="text-sm text-muted">Status:</span>
      <UButton
        v-for="s in STATUSES"
        :key="s.value"
        :color="isStatusActive(s.value) ? 'primary' : 'neutral'"
        :variant="isStatusActive(s.value) ? 'solid' : 'outline'"
        size="xs"
        @click="onStatusClick(s.value)"
      >
        {{ s.label }}
      </UButton>
    </div>

    <div v-if="availableCategories.length > 0" class="flex flex-wrap gap-2 items-center">
      <span class="text-sm text-muted">Category:</span>
      <UButton
        v-for="c in availableCategories"
        :key="c"
        :color="isCategoryActive(c) ? 'primary' : 'neutral'"
        :variant="isCategoryActive(c) ? 'solid' : 'outline'"
        size="xs"
        @click="onCategoryClick(c)"
      >
        {{ c }}
      </UButton>
    </div>

    <UInput
      :model-value="search ?? ''"
      placeholder="Search by name or contact email"
      icon="i-lucide-search"
      @update:model-value="onSearchInput"
    />
  </div>
</template>
```

- [ ] **Step 4: Run, expect pass**

```bash
pnpm test --reporter=verbose tests/components/ArtistFilters.test.ts 2>&1 | tail -10
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add layers/artists/app/components/ArtistFilters.vue tests/components/ArtistFilters.test.ts
git commit -m "feat(artists): add ArtistFilters component + tests"
```

---

## Task 5: `ArtistResourceLinkRow` component + test

**Files:**
- Create: `layers/artists/app/components/ArtistResourceLinkRow.vue`
- Create: `tests/components/ArtistResourceLinkRow.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/components/ArtistResourceLinkRow.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ArtistResourceLinkRow from '#layers/artists/app/components/ArtistResourceLinkRow.vue'

const stubs = {
  UButton: {
    props: ['icon', 'color', 'variant'],
    template: '<button v-bind="$attrs"><slot /></button>',
    inheritAttrs: false,
  },
}

const fakeTimestamp = { _ts: true } as never

describe('ArtistResourceLinkRow', () => {
  it('renders the title when present', () => {
    const w = mount(ArtistResourceLinkRow, {
      props: {
        resource: { url: 'https://x', title: 'Tech rider', kind: 'file', addedBy: 'u1', addedAt: fakeTimestamp },
        canRemove: true,
      },
      global: { stubs },
    })
    expect(w.text()).toContain('Tech rider')
  })

  it('falls back to the URL when no title', () => {
    const w = mount(ArtistResourceLinkRow, {
      props: {
        resource: { url: 'https://drive.google.com/file/abc', kind: 'file', addedBy: 'u1', addedAt: fakeTimestamp },
        canRemove: true,
      },
      global: { stubs },
    })
    expect(w.text()).toContain('https://drive.google.com/file/abc')
  })

  it('emits remove with the URL when remove button is clicked', async () => {
    const w = mount(ArtistResourceLinkRow, {
      props: {
        resource: { url: 'https://x', kind: 'file', addedBy: 'u1', addedAt: fakeTimestamp },
        canRemove: true,
      },
      global: { stubs },
    })
    await w.find('button').trigger('click')
    expect(w.emitted('remove')).toBeTruthy()
    expect(w.emitted('remove')!.at(-1)![0]).toBe('https://x')
  })

  it('hides remove button when canRemove is false', () => {
    const w = mount(ArtistResourceLinkRow, {
      props: {
        resource: { url: 'https://x', kind: 'file', addedBy: 'u1', addedAt: fakeTimestamp },
        canRemove: false,
      },
      global: { stubs },
    })
    expect(w.find('button').exists()).toBe(false)
  })

  it('renders different icons for file vs folder vs unknown', () => {
    const file = mount(ArtistResourceLinkRow, {
      props: { resource: { url: 'https://x', kind: 'file', addedBy: 'u1', addedAt: fakeTimestamp }, canRemove: false },
      global: { stubs },
    })
    expect(file.text()).toContain('📄')

    const folder = mount(ArtistResourceLinkRow, {
      props: { resource: { url: 'https://x', kind: 'folder', addedBy: 'u1', addedAt: fakeTimestamp }, canRemove: false },
      global: { stubs },
    })
    expect(folder.text()).toContain('📁')

    const other = mount(ArtistResourceLinkRow, {
      props: { resource: { url: 'https://x', addedBy: 'u1', addedAt: fakeTimestamp }, canRemove: false },
      global: { stubs },
    })
    expect(other.text()).toContain('🔗')
  })
})
```

- [ ] **Step 2: Run, expect failure**

```bash
pnpm test --reporter=verbose tests/components/ArtistResourceLinkRow.test.ts 2>&1 | tail -10
```

- [ ] **Step 3: Write the component**

```vue
<!-- layers/artists/app/components/ArtistResourceLinkRow.vue -->
<script setup lang="ts">
import type { ResourceLink } from '#layers/artists/shared/types'

const props = defineProps<{
  resource: ResourceLink
  canRemove: boolean
}>()

const emit = defineEmits<{
  remove: [url: string]
}>()

const icon = computed(() => {
  if (props.resource.kind === 'folder') return '📁'
  if (props.resource.kind === 'file') return '📄'
  return '🔗'
})

const label = computed(() => props.resource.title || props.resource.url)
</script>

<template>
  <div class="flex items-center gap-2 text-sm py-1">
    <span aria-hidden="true">{{ icon }}</span>
    <a
      :href="resource.url"
      target="_blank"
      rel="noopener noreferrer"
      class="flex-1 truncate hover:underline text-primary-600"
    >
      {{ label }}
    </a>
    <UButton
      v-if="canRemove"
      icon="i-lucide-x"
      color="neutral"
      variant="ghost"
      size="xs"
      @click="emit('remove', resource.url)"
    />
  </div>
</template>
```

- [ ] **Step 4: Run, expect pass**

```bash
pnpm test --reporter=verbose tests/components/ArtistResourceLinkRow.test.ts 2>&1 | tail -10
```

Expected: 5 passed (the 5th case is the icon-rendering test with 3 sub-mounts).

- [ ] **Step 5: Commit**

```bash
git add layers/artists/app/components/ArtistResourceLinkRow.vue tests/components/ArtistResourceLinkRow.test.ts
git commit -m "feat(artists): add ArtistResourceLinkRow component + tests"
```

---

## Task 6: `ArtistTable` component (no unit test — integration via smoke)

**Files:**
- Create: `layers/artists/app/components/ArtistTable.vue`

`ArtistTable` is integration-tested via the manual smoke check (Task 12). It depends on `useUserById` and `useLocations` which are themselves Firestore-backed; mocking those in vitest gets ugly fast for marginal value over the real-emulator smoke run.

- [ ] **Step 1: Write the component**

```vue
<!-- layers/artists/app/components/ArtistTable.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import type { Artist } from '#layers/artists/shared/types'
import type { EvaluatedChecklistItem } from '#layers/artists/app/composables/useArtistChecklistTemplate'
import type { Location } from '#layers/core/shared/types'

const props = defineProps<{
  artists: (Artist & { id: string })[]
  evaluator: (artist: Artist) => EvaluatedChecklistItem[]
  orgId: string
  eventId: string
  locations: (Location & { id: string })[]
}>()

const locationsById = computed(() => {
  const map: Record<string, string> = {}
  for (const l of props.locations) map[l.id] = l.name
  return map
})

function progress(a: Artist) {
  const items = props.evaluator(a)
  const done = items.filter((i) => i.done).length
  return `${done}/${items.length}`
}

function feeLabel(a: Artist) {
  if (!a.fee) return '—'
  return `${a.fee.amount.toLocaleString()} ${a.fee.currency}`
}

function dayLabel(iso?: string) {
  if (!iso) return '—'
  // ISO yyyy-mm-dd → locale-formatted short date
  const d = new Date(iso + 'T00:00:00Z')
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
</script>

<template>
  <div v-if="artists.length === 0" class="py-8 text-center text-muted text-sm">
    No artists yet. Click "Add artist" to create the first one.
  </div>
  <table v-else class="w-full text-sm">
    <thead class="text-left text-muted">
      <tr class="border-b border-default">
        <th class="py-2 font-medium">Name</th>
        <th class="py-2 font-medium">Category</th>
        <th class="py-2 font-medium">Status</th>
        <th class="py-2 font-medium">Responsible</th>
        <th class="py-2 font-medium">Day</th>
        <th class="py-2 font-medium">Location</th>
        <th class="py-2 font-medium text-right">Fee</th>
        <th class="py-2 font-medium text-right">Progress</th>
      </tr>
    </thead>
    <tbody>
      <tr
        v-for="a in artists"
        :key="a.id"
        class="border-b border-default hover:bg-elevated cursor-pointer"
        @click="$router.push(`/events/${eventId}/artists/${a.id}`)"
      >
        <td class="py-2">{{ a.name }}</td>
        <td class="py-2">{{ a.category }}</td>
        <td class="py-2"><ArtistStatusPill :status="a.status" /></td>
        <td class="py-2">
          <ArtistTableResponsibleCell :uid="a.responsibleUserId" />
        </td>
        <td class="py-2">{{ dayLabel(a.intendedDay) }}</td>
        <td class="py-2">{{ a.intendedLocationId ? (locationsById[a.intendedLocationId] ?? '—') : '—' }}</td>
        <td class="py-2 text-right">{{ feeLabel(a) }}</td>
        <td class="py-2 text-right tabular-nums">{{ progress(a) }}</td>
      </tr>
    </tbody>
  </table>
</template>
```

The `ArtistTableResponsibleCell` is a tiny in-line component because `useUserById` must be called inside a setup function (so it can be re-evaluated per row).

- [ ] **Step 2: Add the inline responsible-cell child**

Create `layers/artists/app/components/ArtistTableResponsibleCell.vue`:

```vue
<!-- layers/artists/app/components/ArtistTableResponsibleCell.vue -->
<script setup lang="ts">
import { useUserById } from '#layers/core/app/composables/useUserById'

const props = defineProps<{
  uid: string | null | undefined
}>()

const user = useUserById(props.uid)
</script>

<template>
  <span class="text-sm">{{ user?.displayName ?? (uid ? `${uid.slice(0, 6)}…` : '—') }}</span>
</template>
```

- [ ] **Step 3: Verify the component compiles**

```bash
pnpm exec nuxt prepare && pnpm typecheck 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add layers/artists/app/components/ArtistTable.vue layers/artists/app/components/ArtistTableResponsibleCell.vue
git commit -m "feat(artists): add ArtistTable component + responsible-cell child"
```

---

## Task 7: `ArtistDetailHeader` component

**Files:**
- Create: `layers/artists/app/components/ArtistDetailHeader.vue`

Status changer + name (inline-editable for booker/director) + responsible display.

- [ ] **Step 1: Write the component**

```vue
<!-- layers/artists/app/components/ArtistDetailHeader.vue -->
<script setup lang="ts">
import type { Artist, ArtistStatus } from '#layers/artists/shared/types'
import { useUserById } from '#layers/core/app/composables/useUserById'

const props = defineProps<{
  artist: Artist
  canEditName: boolean
  canTransition: boolean
}>()

const emit = defineEmits<{
  'update:name': [value: string]
  'transition': [payload: { from: ArtistStatus; to: ArtistStatus }]
}>()

const responsible = useUserById(() => props.artist.responsibleUserId)

const STATUSES: { value: ArtistStatus; label: string }[] = [
  { value: 'planned',   label: 'Planned' },
  { value: 'inquired',  label: 'Inquired' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'declined',  label: 'Declined' },
  { value: 'cancelled', label: 'Cancelled' },
]

function onTransition(to: ArtistStatus) {
  if (to === props.artist.status) return
  emit('transition', { from: props.artist.status, to })
}
</script>

<template>
  <div class="flex flex-col gap-4 mb-6">
    <div class="flex items-baseline gap-3 flex-wrap">
      <UInput
        v-if="canEditName"
        :model-value="artist.name"
        size="xl"
        variant="ghost"
        class="text-2xl font-semibold flex-1 min-w-[12rem]"
        @update:model-value="(v) => emit('update:name', v as string)"
      />
      <h1 v-else class="text-2xl font-semibold">{{ artist.name }}</h1>

      <UBadge v-if="artist.category" color="neutral" variant="subtle" size="sm">
        {{ artist.category }}
      </UBadge>

      <ArtistStatusPill :status="artist.status" />

      <span class="text-sm text-muted">
        ·
        <span v-if="responsible">{{ responsible.displayName }}</span>
        <span v-else-if="artist.responsibleUserId" class="opacity-50">{{ artist.responsibleUserId.slice(0, 6) }}…</span>
        <span v-else class="opacity-50">—</span>
      </span>
    </div>

    <div v-if="canTransition" class="flex flex-wrap gap-2">
      <span class="text-sm text-muted self-center">Move to:</span>
      <UButton
        v-for="s in STATUSES"
        :key="s.value"
        :disabled="s.value === artist.status"
        :color="s.value === artist.status ? 'neutral' : 'primary'"
        :variant="s.value === artist.status ? 'soft' : 'outline'"
        size="xs"
        @click="onTransition(s.value)"
      >
        {{ s.label }}
      </UButton>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Verify it compiles**

```bash
pnpm exec nuxt prepare && pnpm typecheck 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add layers/artists/app/components/ArtistDetailHeader.vue
git commit -m "feat(artists): add ArtistDetailHeader with status changer"
```

---

## Task 8: `ArtistChecklistSection` component

**Files:**
- Create: `layers/artists/app/components/ArtistChecklistSection.vue`

Renders evaluated template items per artist; each item is either a manual checkbox or a resource list with an Add-link form.

- [ ] **Step 1: Write the component**

```vue
<!-- layers/artists/app/components/ArtistChecklistSection.vue -->
<script setup lang="ts">
import { reactive } from 'vue'
import type { Artist, ResourceLink } from '#layers/artists/shared/types'
import type { EvaluatedChecklistItem } from '#layers/artists/app/composables/useArtistChecklistTemplate'

const props = defineProps<{
  items: EvaluatedChecklistItem[]
  artist: Artist
  canEdit: boolean
}>()

const emit = defineEmits<{
  toggle: [payload: { itemId: string; done: boolean }]
  addResource: [payload: { itemId: string; link: { url: string; title?: string }; current: ResourceLink[] }]
  removeResource: [payload: { itemId: string; url: string; current: ResourceLink[] }]
}>()

const drafts = reactive<Record<string, { url: string; title: string }>>({})
function ensureDraft(id: string) {
  if (!drafts[id]) drafts[id] = { url: '', title: '' }
  return drafts[id]
}

function onAdd(itemId: string) {
  const d = drafts[itemId]
  if (!d?.url) return
  const current = props.artist.checklist?.[itemId]?.resources ?? []
  emit('addResource', { itemId, link: { url: d.url, title: d.title || undefined }, current })
  drafts[itemId] = { url: '', title: '' }
}

function onRemove(itemId: string, url: string) {
  const current = props.artist.checklist?.[itemId]?.resources ?? []
  emit('removeResource', { itemId, url, current })
}
</script>

<template>
  <div v-if="items.length === 0" class="text-sm text-muted py-4">
    No checklist items configured for this artist's category.
  </div>
  <div v-else class="space-y-4">
    <div
      v-for="item in items"
      :key="item.id"
      class="border-b border-default pb-3 last:border-b-0 last:pb-0"
    >
      <div class="flex items-start gap-2">
        <UCheckbox
          v-if="!item.requirement"
          :model-value="item.done"
          :disabled="!canEdit"
          @update:model-value="(v) => emit('toggle', { itemId: item.id, done: v as boolean })"
        />
        <span
          v-else
          class="inline-flex h-4 w-4 mt-0.5 items-center justify-center rounded-full"
          :class="item.done ? 'bg-success text-inverted' : 'border border-default text-muted'"
          :title="item.done ? 'Auto-satisfied — resource is linked' : 'Add a resource link to satisfy'"
        >
          <span v-if="item.done" class="text-[10px]">✓</span>
        </span>

        <div class="flex-1">
          <div class="flex items-baseline gap-2">
            <span class="font-medium">{{ item.label }}</span>
            <span v-if="item.description" class="text-xs text-muted">{{ item.description }}</span>
          </div>

          <div v-if="item.requirement?.type === 'resource'" class="mt-2 space-y-1">
            <ArtistResourceLinkRow
              v-for="r in (artist.checklist?.[item.id]?.resources ?? [])"
              :key="r.url"
              :resource="r"
              :can-remove="canEdit"
              @remove="onRemove(item.id, $event)"
            />
            <div v-if="canEdit" class="flex gap-2 items-end mt-2">
              <UFormField label="URL" class="flex-1">
                <UInput v-model="ensureDraft(item.id).url" placeholder="https://drive.google.com/..." />
              </UFormField>
              <UFormField label="Title (optional)">
                <UInput v-model="ensureDraft(item.id).title" />
              </UFormField>
              <UButton size="xs" :disabled="!ensureDraft(item.id).url" @click="onAdd(item.id)">Add</UButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Verify it compiles**

```bash
pnpm exec nuxt prepare && pnpm typecheck 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add layers/artists/app/components/ArtistChecklistSection.vue
git commit -m "feat(artists): add ArtistChecklistSection component"
```

---

## Task 9: `ArtistActivityList` component

**Files:**
- Create: `layers/artists/app/components/ArtistActivityList.vue`

Renders the audit feed with humanized field names and relative time.

- [ ] **Step 1: Write the component**

```vue
<!-- layers/artists/app/components/ArtistActivityList.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import type { ActivityLogEntry } from '#layers/artists/shared/types'
import { useUserById } from '#layers/core/app/composables/useUserById'

const props = defineProps<{
  entries: (ActivityLogEntry & { id: string })[]
}>()

const FIELD_LABELS: Record<string, string> = {
  status:                'Status',
  statusChangedAt:       'Status changed at',
  name:                  'Name',
  category:              'Category',
  shortDescription:      'Short description',
  origin:                'Origin',
  links:                 'Links',
  primaryContact:        'Primary contact',
  responsibleUserId:     'Responsible user',
  fee:                   'Fee',
  travelBudget:          'Travel budget',
  accommodation:         'Accommodation',
  daysPresent:           'Days present',
  dealNotes:             'Deal notes',
  intendedDay:           'Intended day',
  intendedLocationId:    'Intended location',
  performanceDurationMin:'Performance duration',
  performanceNote:       'Performance note',
  checklist:             'Checklist',
  comment:               'Comment',
  deletedAt:             'Soft delete',
}

function fieldLabel(field: string): string {
  if (FIELD_LABELS[field]) return FIELD_LABELS[field]
  // Fall back to the raw dot path so we don't lose information.
  return field
}

function valueLabel(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'string') return v.length > 40 ? v.slice(0, 40) + '…' : v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  try { return JSON.stringify(v) } catch { return String(v) }
}

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

function relativeTime(at: { toMillis?: () => number; seconds?: number } | null | undefined): string {
  if (!at) return ''
  const ms = typeof at.toMillis === 'function' ? at.toMillis() : (at.seconds ?? 0) * 1000
  const diffSec = (Date.now() - ms) / 1000
  if (diffSec < 60) return rtf.format(-Math.round(diffSec), 'second')
  if (diffSec < 3600) return rtf.format(-Math.round(diffSec / 60), 'minute')
  if (diffSec < 86400) return rtf.format(-Math.round(diffSec / 3600), 'hour')
  return rtf.format(-Math.round(diffSec / 86400), 'day')
}
</script>

<template>
  <div v-if="entries.length === 0" class="text-sm text-muted py-4">No activity yet.</div>
  <ul v-else class="space-y-2">
    <li v-for="e in entries" :key="e.id" class="text-sm flex items-baseline gap-2">
      <ArtistActivityListUserName :uid="e.uid" />
      <span class="text-muted">changed</span>
      <span class="font-medium">{{ fieldLabel(e.field) }}</span>
      <span class="text-muted">from</span>
      <code class="text-xs bg-elevated px-1 rounded">{{ valueLabel(e.before) }}</code>
      <span class="text-muted">to</span>
      <code class="text-xs bg-elevated px-1 rounded">{{ valueLabel(e.after) }}</code>
      <span class="text-muted ml-auto">{{ relativeTime(e.at) }}</span>
    </li>
  </ul>
</template>
```

- [ ] **Step 2: Add the inline user-name child**

Create `layers/artists/app/components/ArtistActivityListUserName.vue`:

```vue
<!-- layers/artists/app/components/ArtistActivityListUserName.vue -->
<script setup lang="ts">
import { useUserById } from '#layers/core/app/composables/useUserById'

const props = defineProps<{ uid: string }>()
const user = useUserById(props.uid)
</script>

<template>
  <span class="font-medium">{{ user?.displayName ?? `${uid.slice(0, 6)}…` }}</span>
</template>
```

- [ ] **Step 3: Verify it compiles**

```bash
pnpm exec nuxt prepare && pnpm typecheck 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add layers/artists/app/components/ArtistActivityList.vue layers/artists/app/components/ArtistActivityListUserName.vue
git commit -m "feat(artists): add ArtistActivityList + user-name child"
```

---

## Task 10: Artist list page + Add modal

**Files:**
- Create: `layers/artists/app/pages/events/[eventId]/artists/index.vue`

- [ ] **Step 1: Write the page**

```vue
<!-- layers/artists/app/pages/events/[eventId]/artists/index.vue -->
<script setup lang="ts">
import { computed, ref, reactive } from 'vue'
import { useArtistList, type ArtistListFilter } from '#layers/artists/app/composables/useArtistList'
import { useArtistChecklistTemplate } from '#layers/artists/app/composables/useArtistChecklistTemplate'
import { useArtistMutations } from '#layers/artists/app/composables/useArtistMutations'
import type { ArtistStatus } from '#layers/artists/shared/types'

const route = useRoute()
const eventId = route.params.eventId as string
const { orgId, role, org } = await useOrg()

if (!orgId.value) {
  throw createError({ statusCode: 403, message: 'No organization on this account' })
}

const artists   = useArtistList(orgId.value, eventId)
const locations = useLocations(orgId.value, eventId)
const { evaluateForArtist } = useArtistChecklistTemplate(orgId.value, eventId)
const mut       = useArtistMutations(orgId.value, eventId)

const filter = ref<ArtistListFilter>({})
const search = ref('')

const STATUS_ORDER: ArtistStatus[] = ['planned', 'inquired', 'confirmed', 'declined', 'cancelled']

const observedCategories = computed(() => Array.from(new Set(artists.value.map((a) => a.category))))
const availableCategories = computed(() => {
  const fromOrg = org.value?.artistCategories ?? []
  const merged = new Set([...fromOrg, ...observedCategories.value])
  return Array.from(merged).filter(Boolean).sort()
})

function fuzzy(name: string, contactEmail: string | undefined, q: string): boolean {
  const needle = q.toLowerCase()
  return name.toLowerCase().includes(needle) || (contactEmail?.toLowerCase().includes(needle) ?? false)
}

const filtered = computed(() => {
  let xs = artists.value
  if (filter.value.status?.length) {
    xs = xs.filter((a) => filter.value.status!.includes(a.status))
  }
  if (filter.value.category?.length) {
    xs = xs.filter((a) => filter.value.category!.includes(a.category))
  }
  if (search.value.trim().length > 0) {
    xs = xs.filter((a) => fuzzy(a.name, a.primaryContact?.email, search.value.trim()))
  }
  return [...xs].sort((a, b) => {
    const sa = STATUS_ORDER.indexOf(a.status)
    const sb = STATUS_ORDER.indexOf(b.status)
    if (sa !== sb) return sa - sb
    const ta = a.statusChangedAt?.toMillis?.() ?? 0
    const tb = b.statusChangedAt?.toMillis?.() ?? 0
    return ta - tb
  })
})

const canCreate = computed(() => role.value === 'director' || role.value === 'booker')

const newOpen  = ref(false)
const draft    = reactive({ name: '', category: '' })
const creating = ref(false)

async function onCreate() {
  if (!draft.name.trim() || !draft.category.trim() || creating.value) return
  creating.value = true
  try {
    const ref = await mut.createArtist({ name: draft.name.trim(), category: draft.category.trim() })
    newOpen.value = false
    draft.name = ''
    draft.category = ''
    await navigateTo(`/events/${eventId}/artists/${ref.id}`)
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <AppShell>
    <div class="flex justify-between items-center mb-4">
      <div>
        <NuxtLink :to="`/events/${eventId}`" class="text-sm text-muted hover:underline">← Event</NuxtLink>
        <h1 class="text-2xl font-semibold">Artists</h1>
      </div>
      <UButton v-if="canCreate" icon="i-lucide-plus" @click="newOpen = true">Add artist</UButton>
    </div>

    <ArtistFilters
      v-model="filter"
      v-model:search="search"
      :available-categories="availableCategories"
    />

    <UCard>
      <ArtistTable
        :artists="filtered"
        :evaluator="evaluateForArtist"
        :org-id="orgId"
        :event-id="eventId"
        :locations="locations"
      />
    </UCard>

    <UModal v-model:open="newOpen" title="Add artist">
      <template #body>
        <form class="space-y-3" @submit.prevent="onCreate">
          <UFormField label="Name" required>
            <UInput v-model="draft.name" required />
          </UFormField>
          <UFormField label="Category" required>
            <UInput v-model="draft.category" :placeholder="availableCategories[0]" required />
          </UFormField>
          <p class="text-xs text-muted">
            Status defaults to <strong>planned</strong>. You can edit other fields on the next page.
          </p>
          <UButton type="submit" :loading="creating" :disabled="!draft.name || !draft.category">
            Create
          </UButton>
        </form>
      </template>
    </UModal>
  </AppShell>
</template>
```

- [ ] **Step 2: Verify it compiles**

```bash
pnpm exec nuxt prepare && pnpm typecheck 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add 'layers/artists/app/pages/events/[eventId]/artists/index.vue'
git commit -m "feat(artists): add artist list page + create modal"
```

---

## Task 11: Artist detail page

**Files:**
- Create: `layers/artists/app/pages/events/[eventId]/artists/[artistId].vue`

The big one. 7 sections, inline-edited, debounced. Uses every C1 composable.

- [ ] **Step 1: Write the page**

```vue
<!-- layers/artists/app/pages/events/[eventId]/artists/[artistId].vue -->
<script setup lang="ts">
import { computed } from 'vue'
import { useArtist } from '#layers/artists/app/composables/useArtist'
import { useArtistMutations } from '#layers/artists/app/composables/useArtistMutations'
import { useArtistResources } from '#layers/artists/app/composables/useArtistResources'
import { useArtistChecklistTemplate } from '#layers/artists/app/composables/useArtistChecklistTemplate'
import { useArtistActivity } from '#layers/artists/app/composables/useArtistActivity'
import { useDebouncedFn } from '#layers/artists/app/composables/useDebouncedFn'
import type { Artist, ArtistStatus } from '#layers/artists/shared/types'

const route = useRoute()
const eventId = route.params.eventId as string
const artistId = route.params.artistId as string
const { orgId, role } = await useOrg()
if (!orgId.value) throw createError({ statusCode: 403, message: 'No organization on this account' })

const artist    = useArtist(orgId.value, eventId, artistId)
const locations = useLocations(orgId.value, eventId)
const activity  = useArtistActivity(orgId.value, eventId, artistId)
const { evaluateForArtist } = useArtistChecklistTemplate(orgId.value, eventId)
const mut       = useArtistMutations(orgId.value, eventId)
const resources = useArtistResources(orgId.value, eventId, artistId)

const evaluatedItems = computed(() =>
  artist.value ? evaluateForArtist(artist.value) : [],
)

const canEdit = computed(() => {
  const r = role.value
  return {
    name:        r === 'director' || r === 'booker',
    identity:    r === 'director' || r === 'booker',
    prFields:    r === 'director' || r === 'booker' || r === 'pr',
    booking:     r === 'director' || r === 'booker',
    deal:        r === 'director' || r === 'booker',
    performance: r === 'director' || r === 'booker' || r === 'production',
    checklist:   r === 'director' || r === 'booker' || r === 'production',
    comment:     r === 'director' || r === 'booker' || r === 'production',
    transition:  r === 'director' || r === 'booker',
    softDelete:  r === 'director',
  }
})

// One debounced updater per artist field. Each call captures the
// current snapshot's prior value so the activity log records before/after.
function makeFieldUpdater<K extends keyof Artist>(key: K) {
  return useDebouncedFn(async (value: Artist[K]) => {
    if (!artist.value) return
    const before = { [key]: artist.value[key] } as Partial<Artist>
    const patch  = { [key]: value } as Partial<Artist>
    await mut.updateArtist(artistId, patch, before)
  }, 500)
}

const updateName             = makeFieldUpdater('name')
const updateCategory         = makeFieldUpdater('category')
const updateOrigin           = makeFieldUpdater('origin')
const updateShortDescription = makeFieldUpdater('shortDescription')
const updateLinks            = makeFieldUpdater('links')
const updatePrimaryContact   = makeFieldUpdater('primaryContact')
const updateFee              = makeFieldUpdater('fee')
const updateTravelBudget     = makeFieldUpdater('travelBudget')
const updateAccommodation    = makeFieldUpdater('accommodation')
const updateDaysPresent      = makeFieldUpdater('daysPresent')
const updateDealNotes        = makeFieldUpdater('dealNotes')
const updateIntendedDay      = makeFieldUpdater('intendedDay')
const updateIntendedLocation = makeFieldUpdater('intendedLocationId')
const updatePerformanceDur   = makeFieldUpdater('performanceDurationMin')
const updatePerformanceNote  = makeFieldUpdater('performanceNote')
const updateComment          = makeFieldUpdater('comment')

async function onTransition(payload: { from: ArtistStatus; to: ArtistStatus }) {
  if (!artist.value) return
  await mut.transitionStatus(artistId, payload.to, payload.from)
}

async function onChecklistToggle(payload: { itemId: string; done: boolean }) {
  if (!artist.value) return
  const cur = artist.value.checklist?.[payload.itemId] ?? { done: false }
  const next = { ...cur, done: payload.done }
  await mut.updateArtist(
    artistId,
    { checklist: { ...artist.value.checklist, [payload.itemId]: next } },
    { checklist: artist.value.checklist },
  )
}

async function onAddResource(p: { itemId: string; link: { url: string; title?: string }; current: import('#layers/artists/shared/types').ResourceLink[] }) {
  await resources.addResource(p.itemId, p.link, p.current)
}
async function onRemoveResource(p: { itemId: string; url: string; current: import('#layers/artists/shared/types').ResourceLink[] }) {
  await resources.removeResource(p.itemId, p.url, p.current)
}

async function onSoftDelete() {
  if (!artist.value) return
  if (!confirm(`Delete "${artist.value.name}"? You can recover it from the database within retention window.`)) return
  await mut.softDeleteArtist(artistId)
  await navigateTo(`/events/${eventId}/artists`)
}

const feeAmount      = computed({ get: () => artist.value?.fee?.amount ?? 0,         set: (v) => updateFee({ amount: Number(v), currency: artist.value?.fee?.currency ?? 'CHF' }) })
const feeCurrency    = computed({ get: () => artist.value?.fee?.currency ?? 'CHF',   set: (v) => updateFee({ amount: artist.value?.fee?.amount ?? 0, currency: String(v) }) })
const travelAmount   = computed({ get: () => artist.value?.travelBudget?.amount ?? 0,set: (v) => updateTravelBudget({ amount: Number(v), currency: artist.value?.travelBudget?.currency ?? 'CHF' }) })
const travelCurrency = computed({ get: () => artist.value?.travelBudget?.currency ?? 'CHF', set: (v) => updateTravelBudget({ amount: artist.value?.travelBudget?.amount ?? 0, currency: String(v) }) })

const websiteLink   = computed({ get: () => artist.value?.links?.website ?? '',   set: (v) => updateLinks({ ...(artist.value?.links ?? {}), website: String(v) || undefined }) })
const instagramLink = computed({ get: () => artist.value?.links?.instagram ?? '', set: (v) => updateLinks({ ...(artist.value?.links ?? {}), instagram: String(v) || undefined }) })
</script>

<template>
  <AppShell>
    <NuxtLink :to="`/events/${eventId}/artists`" class="text-sm text-muted hover:underline">← All artists</NuxtLink>

    <div v-if="!artist" class="py-12 text-center text-muted">Loading…</div>

    <template v-else>
      <ArtistDetailHeader
        :artist="artist"
        :can-edit-name="canEdit.name"
        :can-transition="canEdit.transition"
        @update:name="updateName"
        @transition="onTransition"
      />

      <UCard class="mb-4"><template #header>Identity</template>
        <div class="grid gap-3 md:grid-cols-2">
          <UFormField label="Category">
            <UInput :model-value="artist.category" :disabled="!canEdit.identity" @update:model-value="(v) => updateCategory(String(v))" />
          </UFormField>
          <UFormField label="Origin">
            <UInput :model-value="artist.origin ?? ''" :disabled="!canEdit.identity" @update:model-value="(v) => updateOrigin(String(v))" />
          </UFormField>
          <UFormField label="Short description (PR)" class="md:col-span-2">
            <UTextarea :model-value="artist.shortDescription ?? ''" :disabled="!canEdit.prFields" @update:model-value="(v) => updateShortDescription(String(v))" />
          </UFormField>
          <UFormField label="Website">
            <UInput v-model="websiteLink" :disabled="!canEdit.prFields" placeholder="https://" />
          </UFormField>
          <UFormField label="Instagram">
            <UInput v-model="instagramLink" :disabled="!canEdit.prFields" placeholder="@handle" />
          </UFormField>
        </div>
      </UCard>

      <UCard class="mb-4"><template #header>Booking</template>
        <div class="grid gap-3 md:grid-cols-2">
          <UFormField label="Primary contact name">
            <UInput
              :model-value="artist.primaryContact?.name ?? ''"
              :disabled="!canEdit.booking"
              @update:model-value="(v) => updatePrimaryContact({ ...(artist?.primaryContact ?? {}), name: String(v) || undefined })"
            />
          </UFormField>
          <UFormField label="Primary contact email">
            <UInput
              :model-value="artist.primaryContact?.email ?? ''"
              type="email"
              :disabled="!canEdit.booking"
              @update:model-value="(v) => updatePrimaryContact({ ...(artist?.primaryContact ?? {}), email: String(v) || undefined })"
            />
          </UFormField>
        </div>
      </UCard>

      <UCard class="mb-4"><template #header>Deal</template>
        <div class="grid gap-3 md:grid-cols-3">
          <UFormField label="Fee amount"><UInput v-model.number="feeAmount" type="number" min="0" :disabled="!canEdit.deal" /></UFormField>
          <UFormField label="Currency"><UInput v-model="feeCurrency" :disabled="!canEdit.deal" /></UFormField>
          <UFormField label="Days present"><UInput :model-value="artist.daysPresent ?? 0" type="number" min="0" :disabled="!canEdit.deal" @update:model-value="(v) => updateDaysPresent(Number(v))" /></UFormField>
          <UFormField label="Travel budget"><UInput v-model.number="travelAmount" type="number" min="0" :disabled="!canEdit.deal" /></UFormField>
          <UFormField label="Travel currency"><UInput v-model="travelCurrency" :disabled="!canEdit.deal" /></UFormField>
          <UFormField label="Accommodation" class="md:col-span-3"><UInput :model-value="artist.accommodation ?? ''" :disabled="!canEdit.deal" @update:model-value="(v) => updateAccommodation(String(v))" /></UFormField>
          <UFormField label="Deal notes" class="md:col-span-3"><UTextarea :model-value="artist.dealNotes ?? ''" :disabled="!canEdit.deal" @update:model-value="(v) => updateDealNotes(String(v))" /></UFormField>
        </div>
      </UCard>

      <UCard class="mb-4"><template #header>Performance</template>
        <div class="grid gap-3 md:grid-cols-2">
          <UFormField label="Intended day"><UInput :model-value="artist.intendedDay ?? ''" type="date" :disabled="!canEdit.performance" @update:model-value="(v) => updateIntendedDay(String(v) || undefined)" /></UFormField>
          <UFormField label="Intended location">
            <USelect
              :model-value="artist.intendedLocationId ?? ''"
              :items="locations.map((l) => ({ label: l.name, value: l.id }))"
              :disabled="!canEdit.performance"
              @update:model-value="(v) => updateIntendedLocation(String(v) || undefined)"
            />
          </UFormField>
          <UFormField label="Duration (min)"><UInput :model-value="artist.performanceDurationMin ?? 0" type="number" min="0" :disabled="!canEdit.performance" @update:model-value="(v) => updatePerformanceDur(Number(v))" /></UFormField>
          <UFormField label="Performance note"><UInput :model-value="artist.performanceNote ?? ''" :disabled="!canEdit.performance" @update:model-value="(v) => updatePerformanceNote(String(v))" /></UFormField>
        </div>
      </UCard>

      <UCard class="mb-4"><template #header>Checklist</template>
        <ArtistChecklistSection
          :items="evaluatedItems"
          :artist="artist"
          :can-edit="canEdit.checklist"
          @toggle="onChecklistToggle"
          @add-resource="onAddResource"
          @remove-resource="onRemoveResource"
        />
      </UCard>

      <UCard class="mb-4"><template #header>Comment</template>
        <UTextarea :model-value="artist.comment ?? ''" :disabled="!canEdit.comment" @update:model-value="(v) => updateComment(String(v))" />
      </UCard>

      <UCard class="mb-4"><template #header>Activity</template>
        <ArtistActivityList :entries="activity" />
      </UCard>

      <div v-if="canEdit.softDelete" class="mt-6">
        <UButton color="error" variant="soft" icon="i-lucide-trash-2" @click="onSoftDelete">
          Delete artist
        </UButton>
      </div>
    </template>
  </AppShell>
</template>
```

- [ ] **Step 2: Verify it compiles**

```bash
pnpm exec nuxt prepare && pnpm typecheck 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add 'layers/artists/app/pages/events/[eventId]/artists/[artistId].vue'
git commit -m "feat(artists): add artist detail page with inline-edited sections + activity"
```

---

## Task 12: End-to-end smoke check via chrome-devtools-mcp

A manual pass to confirm the UI works end-to-end against the rules.

- [ ] **Step 1: Start dev**

```bash
pkill -f 'firebase emulators:start' 2>/dev/null; pkill -f 'nuxt dev' 2>/dev/null; pkill -f concurrently 2>/dev/null; sleep 1
export JAVA_HOME=/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home
export PATH=$JAVA_HOME/bin:$PATH
pnpm dev
```

Wait for `[wait-for-emulators] hub reports: auth, firestore, functions, storage` and `Local: http://localhost:3000/`.

- [ ] **Step 2: Seed**

```bash
pnpm dev:seed
```

Expected: `Seeded emulator: org=lila, director=director@example.com, event=lila-2025, 2 locations.`

- [ ] **Step 3: Sign in as director (chrome-devtools-mcp)**

Navigate to `http://localhost:3000/login`, fill `director@example.com`, send link, fetch the OOB link from the auth emulator, navigate to it. Confirm dashboard renders "You're in lila... as director."

- [ ] **Step 4: Navigate to artists list**

URL: `http://localhost:3000/events/lila-2025/artists`. Snapshot — should render:
- Header with "Artists" title + "Add artist" button.
- Empty filter chips for status + categories.
- Search input.
- Empty-state row "No artists yet."

- [ ] **Step 5: Create the first artist**

Click "Add artist", fill name `ARXX`, category `Musikact`, click Create. Page should navigate to `/events/lila-2025/artists/<newId>`. Detail header shows `ARXX` + `Musikact` + `Planned` pill.

- [ ] **Step 6: Edit fields, transition status, verify activity**

On the detail page:
1. Type a value into "Origin" → wait 500ms → check the activity log appears with "changed Origin".
2. Click the "Inquired" status button → header pill flips to Inquired → activity log shows "changed Status from planned to inquired".
3. In Performance, pick the intended day + location.
4. In Checklist, tick "Promo material received" (manual) and add a Drive URL to "Tech rider received" → the auto-satisfied item flips to done.
5. Total activity entries should match — about 5–6 changes.

- [ ] **Step 7: Reload, state preserved**

Hard reload `/events/lila-2025/artists/<id>`. All values + activity should re-render.

- [ ] **Step 8: List view shows the artist with progress**

Navigate to `/events/lila-2025/artists` (back button or link). Row for ARXX shows Inquired pill, intended day + location, fee blank, progress `2/9` (or whatever depending on what you ticked).

- [ ] **Step 9: Cross-role check (read-only)**

Sign out, sign in as `crew@example.com` (use the magic-link flow). Navigate to the artists list — should render fine. Open the detail page — every input + textarea should be `disabled`. The status changer + delete CTA should not render.

- [ ] **Step 10: Stop dev**

```bash
pkill -f 'firebase emulators:start' 2>/dev/null; pkill -f 'nuxt dev' 2>/dev/null; pkill -f concurrently 2>/dev/null
```

If any step fails, capture the chrome-devtools console + network requests and triage. Common breakages:
- Permission denied on a write → check the role gating in `canEdit` matches the rules in `layers/artists/firestore.rules.frag`.
- Hydration mismatch on detail page → likely caused by the C1 template defaulting differently between SSR and client; reproduce, file as a follow-up. Most likely fix is to compute `evaluatedItems` after artist is non-null.
- Activity entries missing → check the `before`/`after` payloads in `useArtistMutations.updateArtist`; the activity log only records keys present in `patch`.

---

## Task 13: Push branch + open PR + verify CI green + merge

- [ ] **Step 1: Run the full local test suite + typecheck**

```bash
pnpm test 2>&1 | tail -10
pnpm typecheck 2>&1 | tail -3
```

Expected: ~17 unit tests across composables (existing + new useUserById + useDebouncedFn), 14 component tests across the 3 tested components (5 status pill + 4 filters + 5 resource link); typecheck exit 0.

- [ ] **Step 2: Run rules:check (catches accidental rule drift)**

```bash
pkill -f 'firebase emulators:start' 2>/dev/null; pkill -f 'nuxt dev' 2>/dev/null
export JAVA_HOME=/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home
export PATH=$JAVA_HOME/bin:$PATH
pnpm rules:check 2>&1 | tail -5
```

Expected: 75 firestore + 3 storage tests passing — same as C1's baseline.

- [ ] **Step 3: Push the branch**

```bash
git push -u origin feat/artists-c2-ui 2>&1 | tail -3
```

- [ ] **Step 4: Open the PR via the GitHub MCP**

Title: `feat(artists): C2 UI — list page + detail page + components`

Body summary:
```markdown
## Summary

Ships the artist list and detail UI on top of C1's data layer. Director / booker
can create artists, edit every field inline, transition status, soft-delete.
Production / pr / finance / crew see role-appropriate read-only or partial
edit. Realtime: edits propagate via vuefire's Firestore subscriptions.

## What's in the PR

- New core composable `useUserById(uid)` for arbitrary user lookups.
- New layer composable `useDebouncedFn(fn, ms)` for inline-edit writes.
- 7 components in `layers/artists/app/components/`:
  - `ArtistStatusPill` (5 cases tested)
  - `ArtistFilters` (chip toggles + search; 4 cases tested)
  - `ArtistTable` + `ArtistTableResponsibleCell`
  - `ArtistDetailHeader` (status changer)
  - `ArtistChecklistSection` (manual + resource-requirement variants)
  - `ArtistResourceLinkRow` (5 cases tested)
  - `ArtistActivityList` + `ArtistActivityListUserName`
- 2 pages:
  - `/events/[eventId]/artists` — list + filters + add modal
  - `/events/[eventId]/artists/[artistId]` — 7 inline-edited sections, status changer, activity log, soft-delete

## Test plan

- [x] `pnpm test` green
- [x] `pnpm typecheck` green
- [x] `pnpm rules:check` unchanged (75 firestore + 3 storage)
- [x] Smoke check via chrome-devtools-mcp: create → edit → status → reload → cross-role gating
- [ ] CI green

## Out of scope (deferred)

- Kanban view
- Quick-edit cells in the table
- Member directory / responsible-user picker (read-only in v1)
- Checklist template settings page → C3
- Per-org artist categories editor → C3

References:
- Spec: docs/superpowers/specs/2026-05-09-artists-c2-ui-design.md
- Plan: docs/superpowers/plans/2026-05-09-artists-c2-ui.md
```

- [ ] **Step 5: Watch CI green**

Poll the latest workflow run on `chdabre/festivalmgr` for the head SHA. Should pass: typecheck + test + test:functions + rules:check.

- [ ] **Step 6: Squash-merge once CI is green**

Via the GitHub MCP `merge_pull_request` with `merge_method: 'squash'`. Then sync main locally:

```bash
git checkout main && git pull origin main
```

---

## Plan C2 done

- Artist list + detail UI works end-to-end in the emulator.
- Cross-role gating mirrors the rules from C1.
- Inline-edit + activity log capture every change.
- Spec §9a (table view) + §9b are fully implemented.

**Next:** Plan C3 — checklist template settings page + per-org categories editor + member directory (responsible-user picker), then Plan C4 — sample artists seed + full-flow chrome-devtools smoke covering the spreadsheet-replacement workflow end-to-end.
