# Artist Module — C2: UI (List + Detail) Design

**Status:** Draft for approval
**Date:** 2026-05-09
**Depends on:** [Artist Management Module Design](2026-05-08-artist-management-module-design.md), [Artist C1 Plan](../plans/2026-05-09-artists-c1-data-layer.md)
**Replaces in scope:** the UI portions of spec §9a (table view) and §9b. Settings (§9c, per-org categories) → C3. Sample seed → C4.

## 1. Overview

Plan C2 ships the user-facing surfaces of the artist module: a realtime artist **list page** with status / category filters and a search box, plus an **artist detail page** that lets directors and bookers edit every field inline (no Save button) and is read-only for finance / crew. C1 already shipped the data layer (types, composables, rules, indexes) — C2 wires it up to a UI.

Kanban view (foundation §9a's "Alternate view") is **not** in C2 — it requires a 3rd-party drag-and-drop library and adds flaky-to-test surface for marginal value over the table view. It can ship as a focused follow-up plan if real users ask for it.

## 2. Goals and non-goals

### Goals
- Director / booker can create artists, edit every field, transition status, soft-delete.
- Production can edit performance metadata + checklist + comment (per spec §10).
- PR can edit `shortDescription` + `links` (per spec §10).
- Finance / crew see the read-only detail.
- Realtime: edits from one team member appear instantly for everyone (vuefire + Firestore).
- Activity log surfaces "who changed what when" on the detail page.
- "What's missing" is obvious — list view shows checklist progress per artist.

### Non-goals
- **Kanban view.** Deferred (B from brainstorm).
- **Quick-edit cells in the list table.** Click row → open detail page. One edit surface, not two.
- **Drag-to-reorder** of checklist items. Template editing lives in C3.
- **Member directory / responsible-user picker.** The detail page renders the current responsible's display name read-only in v1; reassigning is deferred to C3 alongside the categories editor.
- **Server-side full-text search.** Substring filter is client-side over the loaded list.
- **Avatar URLs.** Renders initials from `displayName`.
- **Anything from the artist-management spec §11** (custom attributes, offer history, share-links, file uploads, crew field-masking, workflow enforcement, multi-currency conversion, cross-event memory).

## 3. Architecture

```
/events/{eventId}/artists                  (LIST PAGE)
   ├─ ArtistFilters    (status chips × category chips × search input)
   ├─ ArtistTable      (rows linking to detail)
   │     └─ ArtistStatusPill  (re-used on detail header)
   └─ "Add artist" UModal  (name + category + status → createArtist → navigateTo)

/events/{eventId}/artists/{artistId}       (DETAIL PAGE)
   ├─ ArtistDetailHeader      (name + category pill + status changer + responsible)
   │     ├─ ArtistStatusPill
   │     └─ status changer    (5 buttons → mut.transitionStatus)
   ├─ Identity section        (name / category / links / origin / shortDescription)
   ├─ Booking section         (primary contact / responsible)
   ├─ Deal section            (fee / travelBudget / accommodation / daysPresent / dealNotes)
   ├─ Performance section     (intendedDay / intendedLocationId / duration / note)
   ├─ ArtistChecklistSection  (per evaluated template item — manual checkbox or resource list)
   │     └─ ArtistResourceLinkRow  (one link with kind icon + remove button)
   ├─ Comment section         (free-text)
   └─ ArtistActivityList      (last 20 audit entries)
```

All sections are inline-edited via debounced writes per field — no Save buttons. The debounce coalesces fast keystrokes into a single Firestore write; the realtime subscription propagates the change back to all clients (including the editing one) idempotently.

The detail page imports `useArtistMutations`, `useArtistResources`, `useArtistChecklistTemplate`, `useArtistActivity`, and `useArtist` from C1, plus `useLocations` from core for the performance-section dropdown.

## 4. Components

| File | Responsibility |
|---|---|
| `layers/artists/app/components/ArtistStatusPill.vue` | One status → one colored `<UBadge>`. Color map: planned=neutral, inquired=info (blue), confirmed=success (green), declined=error (red), cancelled=warning (orange). |
| `layers/artists/app/components/ArtistFilters.vue` | `v-model:filter` (`ArtistListFilter`) + `availableCategories: string[]`. Status chips × 5, category chips × N, search `<UInput>`. |
| `layers/artists/app/components/ArtistTable.vue` | Renders the filtered+sorted list. Row click → `<NuxtLink>` to `/events/{eventId}/artists/{id}`. Cells: name • category pill • `ArtistStatusPill` • responsible (display name via `useUserById`) • `intendedDay` (formatted) • `intendedLocationId` (resolved to location name via `useLocations`) • `fee.amount + currency` • checklist progress `done/total`. |
| `layers/artists/app/components/ArtistDetailHeader.vue` | Inline-editable name (debounced). Category pill (read-only chip in header; editable in Identity section). `ArtistStatusPill`. Responsible display name. Status-changer row of 5 buttons; clicking emits `transition: { from, to }`. |
| `layers/artists/app/components/ArtistChecklistSection.vue` | Iterates `EvaluatedChecklistItem[]`. For each item: title + description tooltip. If `requirement.type === 'resource'`: list of `ArtistResourceLinkRow` + Add-link form (URL input + optional title); auto-`done` indicator. Otherwise: manual `<UCheckbox>`. Optional per-item note `<UTextarea>`. Emits `toggle`, `addResource`, `removeResource`, `note`. |
| `layers/artists/app/components/ArtistResourceLinkRow.vue` | One resource link: kind icon (`📁` folder / `📄` file / `🔗` other), title or URL truncated, opens-in-new-tab anchor, remove button. |
| `layers/artists/app/components/ArtistActivityList.vue` | Reverse-chrono list of activity entries. Each row: avatar/initials of `entry.uid` (looked up via `useUserById`), human field-name (`status` → "Status"; `fee.amount` → "Fee amount"; unknown paths → dot path verbatim), before → after rendering (booleans / numbers / strings stringified; objects shown as JSON), relative time (`Intl.RelativeTimeFormat`). |

**Per-component test coverage** (full unit tests, mounted with `@vue/test-utils`):
- `tests/components/ArtistStatusPill.test.ts` — each status renders the right Nuxt UI color + label.
- `tests/components/ArtistFilters.test.ts` — chip clicks update `modelValue` correctly; search input emits with debounce.
- `tests/components/ArtistResourceLinkRow.test.ts` — kind-icon mapping; remove emit fires with the right URL.

`ArtistTable`, `ArtistDetailHeader`, `ArtistChecklistSection`, `ArtistActivityList` are integration-tested via the manual smoke check in C4 (mocking the Firestore subscriptions inside vitest gets ugly fast and is low-leverage given the realtime contract is exercised end-to-end every time we run the dev server).

## 5. New core composable

```ts
// layers/core/app/composables/useUserById.ts
import { computed } from 'vue'
import { useDocument, useFirestore } from 'vuefire'
import { doc } from 'firebase/firestore'
import type { User } from '#layers/core/shared/types'

/**
 * Read the global user profile by uid. Returns vuefire's Ref<User | null>
 * — null while loading or if the doc doesn't exist (e.g., a uid from a
 * deleted user). Does NOT cache across instances; for high-volume rendering
 * (e.g., the activity list) consumers should accept that each row may
 * trigger its own Firestore read on first paint, then the realtime cache
 * deduplicates further reads automatically.
 */
export function useUserById(uid: string | null | undefined) {
  const db = useFirestore()
  const docRef = computed(() => uid ? doc(db, 'users', uid) : null)
  return useDocument<User>(docRef)
}
```

The Plan A rule for `users/{uid}` allows reads when `claimOrgId() in resource.data.orgIds` — every member of the same org passes this. Cross-tenant lookups deny.

## 6. Tiny utility — `useDebouncedFn`

```ts
// layers/artists/app/composables/useDebouncedFn.ts
import { onScopeDispose } from 'vue'

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

Used by the detail page to debounce per-field updates (default 500ms).

## 7. Data flow

### List page

```
useArtistList(orgId, eventId, filter)         realtime collection
useArtistChecklistTemplate(orgId, eventId)    realtime template + evaluator
useOrg().org                                  source of org.artistCategories suggestion list

filtered = applyFilter(artists, filter, search)
renderTable(filtered, evaluator)
```

The `useArtistList` query hits Firestore with `where('deletedAt','==',null)` and the optional status / category / responsibleUserId filters; client-side then applies the search-string substring on top.

### Detail page

```
useArtist(orgId, eventId, artistId)           realtime single doc
useArtistChecklistTemplate(orgId, eventId)    template + evaluator
useArtistActivity(orgId, eventId, artistId)   last 20 entries
useArtistMutations(orgId, eventId)            createArtist (used by list), updateArtist, softDelete, transitionStatus
useArtistResources(orgId, eventId, artistId)  add / remove resource links
useLocations(orgId, eventId)                  for performance-section location dropdown

field edit → useDebouncedFn(updateArtist)(patch, before)
status changer click → transitionStatus(artistId, newStatus, oldStatus)
checklist toggle → updateArtist with checklist[itemId].done = newVal
checklist add resource → resources.addResource(itemId, link, currentResources)
delete CTA → softDeleteArtist + navigateTo('../')
```

Every field write threads `before` from the live `artist.value` so the activity log captures change diffs (per C1's `useArtistMutations` API).

## 8. Permission gating

The Firestore rules from C1 are the source of truth. The UI mirrors them with a `canEdit` permission map computed from the role:

| Field group | Roles allowed |
|---|---|
| Identity (name, category, origin, shortDescription, links) | director, booker (and pr can also edit shortDescription + links via spec §10) |
| Booking (primaryContact, responsibleUserId) | director, booker |
| Deal (fee, travelBudget, accommodation, daysPresent, dealNotes) | director, booker |
| Performance (intendedDay, intendedLocationId, performanceDurationMin, performanceNote) | director, booker, production |
| Checklist (resource links, manual checkboxes, notes) | director, booker, production |
| Comment | director, booker, production |
| Soft-delete | director |
| Status transitions | director, booker |

The UI **disables** inputs and **hides** delete / status-changer buttons for roles that don't have the right. The rules will deny anyway if a client somehow bypasses; UI gating is a UX choice, not a security mechanism.

## 9. URL structure

```
/events/{eventId}/artists                                   list view
/events/{eventId}/artists/{artistId}                        detail view (existing artist)
```

No `/new` route in C2 — the "Add artist" flow uses a modal on the list page that creates the artist via `createArtist` then `navigateTo`s the freshly-issued doc id. This avoids the awkward "create-mode for the same component" pattern and is consistent with the existing events / locations creation UX.

## 10. First implementation slice

The plan that flows from this spec covers:

1. New core composable `useUserById`.
2. `useDebouncedFn` utility under `layers/artists/`.
3. `ArtistStatusPill` + unit test.
4. `ArtistFilters` + unit test.
5. `ArtistResourceLinkRow` + unit test.
6. `ArtistTable` (integration-tested via smoke).
7. `ArtistDetailHeader`.
8. `ArtistChecklistSection`.
9. `ArtistActivityList` (with `useUserById` per row and human field-name humanizer).
10. Artist list page + "Add artist" modal.
11. Artist detail page (the big one — 7 sections, inline-edit, debounced writes, status changer, soft-delete).
12. End-to-end smoke check via chrome-devtools-mcp: create artist → edit fields → status transitions reflected in activity → reload preserves state → cross-role gating works (sign in as production / pr / crew, verify field-disable behavior).
13. PR + CI + merge.

## 11. Out of scope (will land later)

- C3: checklist template editor at `/events/[eventId]/settings/artist-checklist`; per-org artist categories editor in core settings.
- C4: sample artists seed; full-flow chrome-devtools smoke covering the spreadsheet-replacement workflow end-to-end.
- A future plan: kanban view; member directory / responsible-user picker; advanced search.
