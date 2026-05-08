# Artist Management Module — Design

**Status:** Draft for approval
**Date:** 2026-05-08
**Depends on:** [Platform Foundation Design](2026-05-08-festivalmgr-platform-foundation-design.md)
**Replaces in scope:** the planned "Riders" and "Booking/Advancing" modules — both fold into Artists.

## 1. Overview

The Artist Management module replaces the lila25 lineup-and-budget spreadsheet with a structured, multi-user, realtime workflow. It is the first domain module on top of the platform foundation and is the most painful current workflow to fix; getting it right unlocks Schedule and Budget.

The spreadsheet flattens six distinct workflow stages — collecting suggestions, transferring to lineup, sending the initial booking request with offer, locking the deal, advancing (riders / contracts / promo), and planning slots — into one wide row. The redesign keeps a single artist record but progresses it through a small number of stages, with a configurable advancing checklist that drives "what's missing for this artist."

Suggestions / "Ideen" are explicitly out of scope: artists enter the system at the moment a booking inquiry is being prepared. Slot planning lives in the Schedule module.

## 2. Goals and non-goals

### Goals
- Replace the lila25 spreadsheet's artist columns with a structured Firestore-backed model.
- Realtime collaboration: edits from one team member appear instantly for everyone.
- Make "what's missing" obvious — production team chases concrete items, not memorised spreadsheet columns.
- Per-event-configurable advancing checklist, so each edition can have different production needs without code changes.
- Forward-compatible with deferred features: custom attributes (quotas), offer history, share-links, file uploads.

### Non-goals (deferred or explicitly out of scope)
- **Suggestions / longlist management.** Stays in the Ideen sheet for now; an artist enters the system only when a booking inquiry is being made.
- **Custom attributes (FLINTA / Rest / Zürich quotas, and similar org-specific fields).** Designed as a generic feature in its own future spec; a forward-compat hook (`customAttributes` map) is in the v1 schema.
- **Per-day attendee counts** (Do/Fr/Sa columns from the spreadsheet) — revisit in a future hospitality module.
- **Offer / negotiation history** — `dealNotes` is the v1 log; a `/offers` subcollection is non-breaking to add later.
- **File uploads to Storage.** Resources are Google Drive links only in v1.
- **Per-document share-links** (already deferred from the platform-foundation MVP).
- **Cross-event "artist memory" view** — added when the second edition runs.
- **Workflow enforcement on status transitions.** v1 allows free transitions; user discipline beats schema rigidity.
- **Multi-currency conversion** in budget rollups.
- **Hard field-masking for crew.** v1 accepts crew sees the full doc; a mirror collection can be added if PII becomes a concern.

## 3. Workflow model — five-state status machine

Status maps the existing German vocabulary one-to-one where it exists:

| Status | German | Meaning |
|---|---|---|
| `planned` | `geplant` | In the system, inquiry not yet sent. Booker is preparing the offer. |
| `inquired` | `angefragt` | Initial inquiry+offer email sent. Awaiting reply / negotiating. The offer is part of the first email; there is no separate "offered" stage. |
| `confirmed` | `bestätigt` | Deal locked. Advancing begins (driven by checklist completion). |
| `declined` | — | They said no. Terminal. |
| `cancelled` | — | Confirmed but later cancelled. Terminal. |

- Default on create: `planned`.
- `statusChangedAt: Timestamp` updated on every transition; powers "longest waiting" sort.
- Transitions are unrestricted in v1. The system records the change rather than enforcing a workflow.
- "Advancing" is **not** a status — it is the work that happens while `confirmed`. Whether advancing is complete is signalled by **checklist completion**, not by a separate status.
- "Ready" is **not** a status — the checklist already says what's missing.

## 4. Architecture decision — single artist document

Each artist is a **single Firestore document** holding identity, booking, deal, performance metadata and per-task checklist state. Resources (Drive links) are nested inside the relevant checklist entry — there is no separate Documents tab and no documents subcollection.

### Why single-document over per-stage subcollections

- Matches the existing spreadsheet mental model.
- Realtime ergonomics: one listener, single-doc updates, every observer instantly consistent.
- Cheapest list-view reads.
- Simplest security rules — one document permission surface, role differences enforced via field-set policy.
- Doc size is irrelevant: artist records are a few KB even with a dozen Drive links.

### Trade-off accepted

No structured offer-negotiation history in v1. The free-text `dealNotes` field doubles as a log; an `/offers/` subcollection can be added later without disturbing the schema.

## 5. Data model

### Artist document — `/organizations/{orgId}/events/{eventId}/artists/{artistId}`

```ts
type Artist = {
  // ─── Identity ────────────────────────────────────────────────────
  name: string                            // "ARXX", "Dornika"
  category: string                        // free-form; per-org configurable suggestion list
  links: {
    website?: string
    instagram?: string
    other?: { label: string; url: string }[]
  }
  origin?: string                         // free-text "Berlin, DE", "Zürich, CH"
  shortDescription?: string               // optional bio for PR / future share-links

  // ─── Booking ─────────────────────────────────────────────────────
  status: 'planned' | 'inquired' | 'confirmed' | 'declined' | 'cancelled'
  statusChangedAt: Timestamp
  primaryContact?: {
    name?: string
    email?: string
    role?: string                         // "Manager", "Agent", "Self"
    note?: string
  }
  responsibleUserId?: string              // uid of the booker on point

  // ─── Deal terms (proposed in planned/inquired, locked by convention once confirmed) ───
  fee?: { amount: number; currency: string }
  travelBudget?: { amount: number; currency: string }
  accommodation?: string                  // free-text — "2 EZ", "1 EZ, 1 DZ", "do-fr"
  daysPresent?: number
  dealNotes?: string                      // doubles as negotiation log in v1

  // ─── Performance metadata (intent — actual slot owned by Schedule) ───
  intendedDay?: string                    // ISO date "2025-08-22" within event.dates
  intendedLocationId?: string             // ref to /locations/{id}
  performanceDurationMin?: number         // single number; ranges captured in performanceNote
  performanceNote?: string                // optional, e.g. "30–45 min depending on slot"

  // ─── Advancing checklist state ───────────────────────────────────
  // Keys reference event.artistChecklistTemplate[].id (stable, never reused).
  checklist: { [itemId: string]: ChecklistEntry }

  // ─── Generic / forward-compat ────────────────────────────────────
  comment?: string                        // free-text catch-all
  customAttributes?: { [key: string]: any }   // forward-hook for deferred quotas etc.

  // ─── Lifecycle ───────────────────────────────────────────────────
  createdAt: Timestamp
  createdBy: string                       // uid
  updatedAt: Timestamp
  updatedBy: string                       // uid
  deletedAt: Timestamp | null             // soft-delete per platform spec §6
}

type ChecklistEntry = {
  done: boolean                           // manual checkbox OR derived from requirement
  autoSatisfied?: boolean                 // true when requirement is currently met
  doneAt?: Timestamp
  doneBy?: string                         // uid; null when auto-satisfied
  resources?: ResourceLink[]              // populated when the task takes a resource
  note?: string                           // free-text per-task note
}

type ResourceLink = {
  url: string                             // Google Drive URL (file or folder)
  title?: string                          // optional human label
  kind?: 'file' | 'folder'                // hint for UI icon; user-set or inferred
  addedBy: string                         // uid
  addedAt: Timestamp
}
```

### Activity log — `/organizations/{orgId}/events/{eventId}/artists/{artistId}/activity/{logId}`

Append-only audit subcollection written by the composable on each update. v1 schema:

```ts
type ActivityLog = {
  uid: string
  at: Timestamp
  field: string                           // dot-path, e.g. "status", "fee.amount"
  before: any
  after: any
}
```

Used by the detail page's "Activity" section. Capped to last 20 entries shown by default.

### Renames vs the platform spec / spreadsheet

- "Verantwortung" → `responsibleUserId` (uid, not free-text name).
- "Tag" → `intendedDay` (ISO date, not "Do/Fr/Sa") — derives a label from `event.dates`.
- "Raum" → `intendedLocationId` (reference, not name).
- "Performance Dauer" with ranges like "30 - 45" → `performanceDurationMin: 30` plus `performanceNote: "30–45"`.
- "Status" `geplant/angefragt/bestätigt` → `planned/inquired/confirmed`.

### Removed (relative to spreadsheet / earlier brainstorm draft)

- `riderStatus` — the checklist + resource-requirement covers this generically.
- `contractStatus` — same.
- Per-day attendee counts (Do/Fr/Sa) — out of scope.
- FLINTA/Rest/Zürich numeric quotas — captured later via custom attributes.
- Boolean checklist columns (Visuell ansprechend / Dolmetschung / Promomaterial / Techrider / Vertrag / Productionsheet / Supplement) — replaced by the configurable checklist.

### Indexes

```
(deletedAt asc, status asc, statusChangedAt asc)         # list view
(deletedAt asc, intendedDay asc, intendedLocationId asc) # schedule planning
(deletedAt asc, responsibleUserId asc, status asc)       # "my artists"
```

## 6. Configurable checklist mechanic

The advancing checklist is the spine of post-confirmation work. Two parts: a per-event template (config) and per-artist state (already on the artist doc above).

### Template — on the Event doc

```ts
// added to the existing platform-spec Event type
type Event = {
  // ... existing fields per platform spec §6 ...
  artistChecklistTemplate: ChecklistItemConfig[]
}

type ChecklistItemConfig = {
  id: string                              // stable; never reused (so artist state doesn't orphan)
  label: string                           // "Tech rider received"
  description?: string
  order: number
  appliesToCategories?: string[]          // optional filter — only show for these artist.category values
  requirement?: ChecklistRequirement
}

type ChecklistRequirement =
  | { type: 'resource' }                  // task auto-satisfies when ≥1 resource linked
  // future types kept out of v1 (YAGNI):
  //   | { type: 'field';  fieldPath: string }
  //   | { type: 'document-count'; min: number }
```

### Behaviour

1. **Authoring:** director and production edit `event.artistChecklistTemplate` from a settings page. "Copy from previous event" pulls from the event with the next-most-recent `dates.start` in the same org. Item IDs are immutable once created; deleting an item leaves orphan state in artists' `checklist` maps but the UI hides it (recoverable if delete was a mistake).
2. **Per-artist evaluation:**
   - Items where `appliesToCategories` excludes the artist's category are hidden.
   - For visible items the UI reads `artist.checklist[itemId]` (defaulting to `{done: false}` when missing).
   - If the item has `requirement.type === 'resource'`, `done` is computed as `(resources?.length ?? 0) > 0`. The user cannot tick it manually; they instead link a resource. Manual checkbox otherwise.
3. **Where evaluation lives:**
   - **Client-side** for display.
   - **Server-side enforcement is not added in v1** — Firestore rules don't validate cross-field consistency on writes. If integrity becomes a problem, a Cloud Function `onWrite` trigger can compute `autoSatisfied` server-side. Deferred.
4. **List-view "what's missing" indicator:** for each `confirmed` artist, show `done / total applicable items`. Sort option: least-complete first.

### Resource link UX

- Add Resource form: paste URL, optional title, click save. Stored on the artist inside `checklist[itemId].resources`.
- URL `kind` heuristic: `drive.google.com/drive/folders/...` → folder, `drive.google.com/file/...` → file. Editable.
- No Storage uploads in v1.

### Default seed template

When an event is created, `event.artistChecklistTemplate` is populated with this starter list (editable):

- "Promo material received" — no requirement
- "Tech rider received" — requires resource
- "Stage plot received" — requires resource
- "Contract sent" — no requirement
- "Contract signed" — requires resource
- "Production sheet completed" — no requirement
- "Hospitality info confirmed" — no requirement
- "Travel arranged" — no requirement
- "Accommodation arranged" — no requirement

## 7. Cross-module integration

Per platform spec §9 / §14: modules communicate through Firestore writes, not direct imports.

### Artists → Schedule

- Artist owns `intendedDay`, `intendedLocationId`, `performanceDurationMin` (the booker's pencilled-in plan).
- Schedule owns `/events/{eventId}/timetableEvents/{teId}` (the actual scheduled slot, including travel/transfer/load-in/soundcheck slots in addition to performance).
- A `timetableEvent` references an artist by `artistId`. If a timetable event exists for the artist, it wins for production-view display. The artist's intended values remain visible in the artist detail as "originally pencilled in." No destructive merge.
- The Schedule layer subscribes to `/artists` for slot rendering. Artists do not depend on Schedule.

### Artists → Budget

- Artist owns `fee`, `travelBudget`, `accommodation` (canonical numbers).
- Budget reads all artists for the event, filters by `status in ['inquired','confirmed']` (declined/cancelled excluded by default), and rolls up:
  - `Σ fee.amount` per category — replaces "Summe Gagen".
  - `Σ travelBudget.amount` — replaces "Summe Reisekosten".
  - Accommodation is free-text in v1, so Budget can't sum it; Budget shows a manual override for the accommodation total (matching the spreadsheet today).
  - Currency: org's `defaultCurrency` is assumed; Budget warns when an artist's currency differs.
- Reserve mechanic ("10% Aufschlag for Vertragskonditionen Schweiz") is owned by Budget, computed from rolled-up fees. Not on the artist.
- Convenience composable `useArtistFinancials(eventId)` exposes the rollup.

### Artists → PR / share-links (deferred but designed)

- Share-link safe fields are pre-identified: `name`, `shortDescription`, `links.*`, `intendedDay`, `intendedLocationId`, `performanceDurationMin`, `performanceNote`.
- Resources inside `checklist[*].resources` are explicitly NOT default-shareable (internal Drive links).

### Cross-event roster lookup

Collection-group query on `artists` filtered by `orgId` (claim) supports a future "we already booked X in 2024" view. Index will be defined when implemented.

## 8. Module-roadmap impact

The platform-foundation spec §13 listed five modules: Artists / Schedule / Booking / Riders / Budget. After this design:

- Riders folds into Artists (resources on checklist items).
- Booking/Advancing was always going to live inside Artists (the 6-step workflow described by the user **is** the artist module).
- PR remains a role, not a module — they get role-scoped permissions on artist fields.

**Surviving modules: Artists, Schedule, Budget.** A small follow-up update to the platform spec's §13 captures this once this design lands.

## 9. UI shape

Three primary surfaces, all in `/layers/artists/pages/`.

### 9a. Artist list — `/events/[eventId]/artists`

- **Default view:** table, one row per artist. Columns: Name • Category • Status (pill) • Responsible (avatar) • Intended day • Intended location • Fee • Checklist progress (`4/9`).
- **Sort default:** status group (`planned` → `inquired` → `confirmed` → `declined` → `cancelled`), then `statusChangedAt asc` (oldest waiting at top).
- **Status filter chips** (multi-select); **Category filter chips** (multi-select).
- **Quick-edit cells** for responsibility, status, day — single-click optimistic update.
- **Search:** name substring + `primaryContact.email` substring.
- **Alternate view: Kanban** — columns = status; cards show name / category / fee / progress; drag-between updates `status` + `statusChangedAt`.
- **"Add artist" button** opens detail editor in create mode. Default `status = 'planned'`, default `responsibleUserId = current user`.

### 9b. Artist detail — `/events/[eventId]/artists/[artistId]`

Single-page form, sections collapsible, fields edited inline (Firestore realtime, debounced writes per field — no Save button).

- **Header:** name, category pill, status pill, responsible avatar.
- **Status changer:** five buttons or dropdown — single-click transitions, fires `statusChangedAt`.
- **Sections** (auto-open the one relevant to current status):
  1. Identity — name, category, links, origin, short description.
  2. Booking — primary contact, responsible user.
  3. Deal — fee, travel budget, accommodation, days present, deal notes.
  4. Performance — intended day (date picker constrained to `event.dates`), intended location (select from event's locations), duration, performance note.
  5. Checklist — for each applicable template item: label + description tooltip; resource list with "Add link" button when requirement is `resource`; manual checkbox otherwise; per-item note.
  6. Comment — free-text.
  7. Activity — last 20 changes (uid, field, before → after, timestamp).
- **Soft-delete** at the bottom (sets `deletedAt`); director only.

### 9c. Checklist settings — `/events/[eventId]/settings/artist-checklist`

- Drag-reorder list of `ChecklistItemConfig` items.
- Each row: label, description, applies-to-categories multi-select, requirement type (none / resource).
- "Copy from previous event" button.
- Director and production roles only.

### Per-org category list editor

Lives under existing org/event settings. Field: `org.artistCategories: string[]`. UI offers them as suggestions; `artist.category` remains free-form so a typo or one-off doesn't block creation.

## 10. Security rules

Slotted into the `match /organizations/{orgId} {` block per platform spec §10. Rules-unit tests required for every clause.

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
                  // director / booker: any field
                  hasRole(['director','booker']) && isValidArtistOnUpdate(request.resource.data)
                  // production: performance + checklist + comment only
                  || (hasRole(['production'])
                      && onlyFieldsChanged(['intendedDay','intendedLocationId',
                                            'performanceDurationMin','performanceNote',
                                            'checklist','comment','updatedAt','updatedBy']))
                  // pr: identity-light fields only
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

Helpers (defined in the shared rules header per platform spec §10):

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
```

### Required rules tests

| # | Scenario | Expected |
|---|---|---|
| 1 | Booker in org A creates a valid artist in their event | allow |
| 2 | Booker in org A reads/writes any artist in org B | deny |
| 3 | Anonymous read | deny |
| 4 | Crew tries to update any field | deny |
| 5 | Production updates `fee` | deny |
| 6 | Production updates `intendedDay` and `checklist[x].done` | allow |
| 7 | PR updates `shortDescription` and `links` | allow |
| 8 | PR updates `fee` | deny |
| 9 | Director hard-deletes | allow |
| 10 | Booker hard-deletes | deny |
| 11 | Create with missing `name` / invalid `status` / missing `createdBy` | deny |
| 12 | Update sets `status` to invalid value | deny |
| 13 | Soft-deleted artist read returns deny (treated as gone) | deny |

## 11. Forward-compat hooks

Designed-for, not built — addition is non-breaking:

- **Custom attributes** — `customAttributes` map on artist + future `org.customAttributeDefinitions`. Quotas (FLINTA / Rest / Zürich) become the first concrete user.
- **Offer history** — `/artists/{id}/offers/{offerId}` subcollection with `{ amount, currency, sentAt, response, sentBy }`. `fee` continues to hold the current/locked amount.
- **Share-links** — already-listed safe fields; resources stay internal.
- **Crew field-masking** — Cloud Function-maintained `/events/{eventId}/artistsCrewView/{artistId}` mirror with safe fields only, if PII becomes a concern.
- **File uploads** — `ResourceLink.source: 'upload' | 'link'` plus optional `storagePath`; existing link-only resources remain valid.
- **Workflow enforcement** — transition guard in rules or a Cloud Function, no schema change required.
- **Multi-org artist memory** — collection-group query already supported by structure.

## 12. First-slice scope (Artist module v1)

### In v1

1. Data model + rules + rules tests (Sections 5, 10).
2. Composables in `/layers/artists/composables/`:
   - `useArtistList(eventId, filters?)` — realtime list with status/category filters.
   - `useArtist(eventId, artistId)` — realtime single-doc.
   - `createArtist`, `updateArtist`, `softDeleteArtist`, `transitionStatus`.
   - `addResourceToTask`, `removeResourceFromTask`.
   - `useArtistChecklistTemplate(eventId)` — reads `event.artistChecklistTemplate`.
   - `useArtistFinancials(eventId)` — read-side rollup convenience.
3. Pages:
   - `/events/[eventId]/artists` — list view (table default, kanban toggle).
   - `/events/[eventId]/artists/[artistId]` — detail editor.
   - `/events/[eventId]/settings/artist-checklist` — checklist template editor.
4. Per-org category list editor under existing settings (`org.artistCategories: string[]`).
5. Indexes — the three listed in Section 5.
6. Activity-log subcollection writes via composable.
7. Default checklist seed populated when an event is created (Section 6).
8. Emulator seed script: ~10 sample artists across categories.
9. Tests:
   - Rules tests (Section 10's table 1–13).
   - Component tests for list filters and the resource-link UI.

### Deferred to follow-up specs

- Custom attributes (quotas etc.).
- Offer history subcollection.
- Share-links for per-artist info sheets.
- File uploads (Firebase Storage).
- Hospitality / per-day attendee planning.
- Crew artist-view mirror.
- Workflow enforcement on status transitions.
- Multi-currency conversion in Budget rollups.
- Cross-event "artist memory" view.

### Dependencies on the platform foundation

- The `core` layer must ship first (auth, claims, org, event, location, membership, rules helpers, compose-rules pipeline). The bootstrap plan that delivers it is a separate prerequisite document.
- The artist module assumes `event.dates` and `event.locations` exist. It reads them; it does not write them.
