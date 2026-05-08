# festivalmgr — Platform Foundation Design

**Status:** Draft for approval
**Date:** 2026-05-08
**Scope:** Platform foundation only. Each domain module (Artists, Schedule, Booking, Riders, Budget) gets its own brainstorm → spec → plan → implement cycle in subsequent sessions.

## 1. Overview

A cloud-based, multi-tenant SaaS for organizing community-based arts/music/culture festivals. Built first to replace the spreadsheet-and-Drive workflow at lila. queer festival (Zürich), structured from day one to onboard additional festival organizations later.

The platform is a **modular monolith**: a single Nuxt 4 + Nuxt UI v4 app and a single Firebase project, with each domain module isolated as a Nuxt **layer** so it can be developed, hidden per-tenant, or extracted later without coupling.

The architectural pattern is **Firebase-native, direct-from-client**: the Nuxt frontend talks directly to Firestore via the client SDK; security rules enforce auth and tenant isolation; Cloud Functions are used sparingly for things that genuinely require a server (email, scheduled jobs, public crowd-API, public mirror writes).

## 2. Goals and non-goals

### Goals
- Replace the current artist-management spreadsheet with a real multi-user system, with realtime collaboration.
- Provide a clean, modular base on which the five domain modules can be built one at a time.
- Multi-tenant from day one (data, auth, paths) — even though only one tenant (lila.) is seeded in v1.
- Public read surfaces: per-document share-links (e.g. always-current artist info sheets) and a crowd-facing timetable API, neither of which exposes tenant-internal data.
- Solo, part-time-developer-friendly: minimal ops, conventional patterns, no premature abstraction.

### Non-goals (deferred or explicitly out of scope)
- **Stripe / billing.** No paid tenants yet. Add when a second tenant signs up.
- **Self-service org signup.** Tenants are seeded manually until billing exists.
- **Per-module fine-grained ACLs / custom roles.** Six fixed roles; custom roles only if a real case demands.
- **Artist self-service portal.** Out of v1; revisited during the Booking/Advancing module brainstorm.
- **Multi-festival / series grouping under one org.** An optional `seriesId` field can be added later when a tenant needs it.
- **Real-time presence indicators.** Firestore realtime gives us conflict-free collaboration; presence is a later UX nicety.
- **Native mobile app.** Web is responsive; mobile is post-v1.
- **Advanced search (full-text / fuzzy).** Firestore queries are fine at current scale; add Algolia/Typesense later if needed.
- **Per-edition module enable/disable.** Modules are enabled per-org only.

## 3. System architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Nuxt 4 + Nuxt UI v4 (single project, modular monolith)     │
│  ├─ Auth-protected app (SPA-mode dynamic routes)            │
│  ├─ Public share-link pages (SSR, indexable per-token)      │
│  └─ Server routes (Nitro) — only for the public crowd API   │
└──────────────────────────────────────────────────────────────┘
                ↕ Firebase Auth (login + ID token)
                ↕ Firestore SDK (direct, realtime)
                ↕ Firebase Storage (riders, photos, contracts)
┌──────────────────────────────────────────────────────────────┐
│  Firebase project                                           │
│  ├─ Firestore  (data; security rules = permission source)   │
│  ├─ Auth       (custom claims: orgId + role)                │
│  ├─ Storage    (files; security rules mirror Firestore)     │
│  ├─ Functions  (sparingly — email, scheduled jobs,          │
│  │              public-mirror writes, share-link resolver)  │
│  └─ Hosting    — not used; Nuxt deploys to Netlify          │
└──────────────────────────────────────────────────────────────┘
```

- **One Nuxt project, one Firebase project.**
- **Frontend deploy target:** Netlify (Nuxt has a first-class Netlify preset).
- **No separate API service.** The "backend" is Firestore + a small set of Cloud Functions; no Express/NestJS/Fastify.
- **Realtime is a first-class win:** the Firestore SDK pushes changes to all logged-in clients automatically — no more "who has the spreadsheet open?"

## 4. Tech stack

| Layer | Choice |
|---|---|
| Frontend | Nuxt 4 + Nuxt UI v4 + Tailwind CSS v4 |
| Firebase glue | **VueFire** (`nuxt-vuefire`) for client SDK wiring, SSR-safe composables (`useFirestore`, `useDocument`, `useCollection`, `useCurrentUser`), and emulator config |
| State / data | Firestore client SDK via VueFire's realtime composables; app-specific composables (`useOrg`, `useEvent`, …) wrap them |
| Auth | Firebase Auth (email magic-link + Google sign-in), exposed via VueFire's `useCurrentUser` |
| File storage | Firebase Storage |
| Server logic | Cloud Functions for Firebase (TypeScript) |
| i18n | `@nuxtjs/i18n`, `defaultLocale: 'en'`, German added later. Nuxt UI v4.7+ auto-localizes `<ULink>` `to` props when this module is installed. |
| Hosting | Netlify (frontend, zero-config Nitro preset); Firebase project for everything else |
| CI/CD | GitHub Actions; Netlify previews per PR |
| Testing | Vitest (unit/component); Firebase Rules Unit Testing SDK against the emulator |

**Why VueFire over a hand-rolled `firebase/firestore` wrapper:** it's the only Firebase module on the official Nuxt registry, gives us idiomatic SSR-safe composables out of the box (relevant for §8a public share-link SSR pages), wires emulators with one config block, and the API surface we'd otherwise reinvent (`useDocument(ref)`, `useCollection(ref)`) matches what the rest of this spec already assumes.

**Nuxt 4 specifics that shape the rest of this doc:**
- App code lives under `app/`, with `server/` and `shared/` as siblings of it (see §9).
- A single root `tsconfig.json`; Nuxt generates per-context type contexts internally.
- Layers in `~~/layers/` are auto-registered (no `extends:` needed for local layers); each gets a named alias like `#layers/core`.
- Nuxt 5 upgrade path: revisit `future.compatibilityVersion: 5` once Nuxt 5 ships. Not in scope for v1.

## 5. Multi-tenant Firestore data layout

Tenant boundaries are **structural, not just filter-based**: every tenant doc lives under `/organizations/{orgId}/...`.

```
/organizations/{orgId}                            (Org doc)
  /memberships/{userId}                            (role + status for this user in this org)
  /events/{eventId}                                (Event doc — single annual event for v1)
    /locations/{locationId}                        (Aktionshalle, Clubraum, Fabriktheater, etc.)
    /artists/{artistId}                            (Artist module)
    /budgetItems/{itemId}                          (Budget module)
    /timetableEvents/{teId}                        (Schedule module)
    /shareLinks/{token}                            (Public read tokens — see §8)
    ... (each module owns its own subcollections)

/users/{uid}                                      (Global user profile; forward-compatible
                                                   with users in multiple orgs later)
/publicEvent/{publicSlug}                          (Public denormalized mirror — see §8)
```

**Rationale for nesting under `organizations/{orgId}`:**
- A query in org A literally cannot return docs in org B. Forgotten `where('orgId', '==', ...)` clauses cannot leak data.
- Security rules become dramatically simpler — one top-level rule on `/organizations/{orgId}/...` checks `orgId` against the user's claim, then per-collection rules just check role.
- Collection group queries still work for the rare cross-event query.

**Rationale for `users/` at the top level:**
A user might eventually belong to multiple orgs. Their global profile (email, displayName) lives once at `/users/{uid}`; their org-specific role lives in `/organizations/{orgId}/memberships/{uid}`.

**Rationale for `publicEvent/` at the top level:**
World-readable rules cannot live inside a path that requires auth. A Cloud Function mirrors *only the safe-to-publish* slice of an event into `/publicEvent/{slug}` whenever the source changes. Nothing in `organizations/` is ever world-readable.

## 6. Core shared entities (data model)

These are the schemas owned by `/layers/core` — every module consumes them. TypeScript types are 1:1 with Firestore docs.

```ts
// /users/{uid}
type User = {
  email: string
  displayName: string
  photoURL?: string
  orgIds: string[]                               // denormalized; maintained by setMembership Function
  createdAt: Timestamp
}

// /organizations/{orgId}
type Organization = {
  name: string                                   // "lila. queer festival e.V."
  slug: string                                   // url-safe; immutable
  defaultLocale: string                          // 'en' for v1; tenants override
  defaultCurrency: string                        // 'CHF', 'EUR', ...
  enabledModules: ModuleKey[]                    // ['artists','budget','booking','riders','schedule']
  branding?: { logoStoragePath?: string; primaryColor?: string }
  createdAt: Timestamp
}
type ModuleKey = 'artists' | 'budget' | 'booking' | 'riders' | 'schedule'

// /organizations/{orgId}/memberships/{userId}
type Membership = {
  userId: string
  role: 'director' | 'booker' | 'production' | 'finance' | 'pr' | 'crew'
  invitedBy: string                              // uid
  invitedAt: Timestamp
  acceptedAt?: Timestamp                         // null while pending magic-link
  status: 'pending' | 'active' | 'revoked'
}

// /organizations/{orgId}/events/{eventId}
type Event = {
  name: string                                   // "lila. queer festival 2025"
  slug: string                                   // immutable; "lila-2025"
  primaryLocale: string                          // 'en' default; per-event override allowed
  primaryContacts: string[]                      // uids of director(s) for this event
  status: 'planning' | 'live' | 'archived'
  dates: { start: Timestamp; end: Timestamp }    // day labels derived in UI from this range
  publicSlug?: string                            // crowd API URL slug
  publishToPublic: boolean                       // gates publicEvent mirror
  createdAt: Timestamp
  deletedAt: Timestamp | null                    // soft-delete
}

// /organizations/{orgId}/events/{eventId}/locations/{locationId}
type Location = {
  name: string                                   // "Aktionshalle", "Clubraum", "Marktstand"
  capacity?: number
  notes?: string
  order: number                                  // display ordering
}
```

**Soft-delete pattern:** docs that may be referenced by other modules (Event, Location) get a `deletedAt: Timestamp | null` rather than hard delete. Module queries filter `where('deletedAt', '==', null)`. This avoids dangling references in budgets/schedules pointing at a location that no longer exists.

**IDs:** Firestore auto-IDs for everything except where the user picks a slug (Org, Event). Slugs are immutable to keep URLs and storage paths stable. Display names are mutable.

**Module subcollections** (designed in their own brainstorms):
- `/events/{eventId}/artists/{artistId}` — Artists module (first; replaces the lila25 lineup spreadsheet)
- `/events/{eventId}/timetableEvents/{teId}` — Schedule module (`startsAt + durationMin + locationId + artistId`; days derived from `event.dates`)
- `/events/{eventId}/budgetItems/{itemId}` — Budget module (most complex; designed last)
- Riders/Booking subcollections — designed when those modules are brainstormed

## 7. Auth and roles

**Login:** Firebase Auth with **email magic-link** and **Google sign-in**. No passwords.

**Tenant + role on the user — Firebase custom claims:**
```ts
{
  orgId: 'lila',                                // current active org
  role:  'director' | 'booker' | 'production' | 'finance' | 'pr' | 'crew',
  orgs:  { lila: 'director' }                   // future: user can be in multiple orgs
}
```
Custom claims are signed into the Firebase ID token and read by security rules without an extra Firestore read.

**Roles for v1:**

| Role | High-level capabilities (fine-grained per-module rules in module specs) |
|---|---|
| `director` | Everything. Manage org settings, members, all modules. |
| `booker` | R/W Artists, Booking/Advancing, Riders. Read budgets but not edit. Read schedules. |
| `production` | R/W Schedules, Daysheets, Locations, technical riders. Read artists. |
| `finance` | R/W Budget. Read artists, contracts, payouts. |
| `pr` | R/W artist bios, press materials, public share-links. Read schedules. |
| `crew` | Read-only on schedules, daysheets, daysheet-relevant artist info. |

**Membership lifecycle:**
1. Director invites a teammate by email via the in-app "Invite teammate" flow.
2. A `setMembership` Cloud Function creates `/organizations/{orgId}/memberships/{userId}` with `status: 'pending'` and sends a magic-link sign-in email.
3. On first sign-in, a Function flips status to `active`, writes the custom claim, and adds `orgId` to the user's denormalized `User.orgIds`.
4. Director can revoke membership; Function flips status to `revoked`, clears the claim, and removes `orgId` from `User.orgIds`.

**Source-of-truth split:**
- The **claim** is the source of truth that security rules trust.
- The **membership doc** is the source of truth the UI displays ("who's in this org").
- A Cloud Function keeps them in sync; admins never write membership docs directly.

**Bootstrapping:** the developer seeds the first `director` user via a one-off script (`scripts/seed-director.ts`) in staging and prod.

## 8. Public read surfaces

Two distinct public surfaces, intentionally separated.

### 8a. Per-document share-links

```
/organizations/{orgId}/shareLinks/{token}
  ─ docPath: "organizations/lila/events/lila-2025/artists/abc123"
  ─ kind: "artist-infosheet"                    // discriminator for renderer
  ─ allowedFields: ["name","stage","day","setLength","contact","techRequirements"]
  ─ expiresAt?: Timestamp
  ─ revokedAt?: Timestamp
  ─ createdBy, createdAt
```

**Resolution flow:**
1. Public Nuxt page `/s/[token].vue` (SSR).
2. Calls Cloud Function `resolveShareLink({ token })`.
3. Function looks up the token (no auth — the token *is* the secret), checks `expiresAt` / `revokedAt`, fetches the source doc by `docPath`, returns **only** the fields in `allowedFields`.
4. Nuxt renders the info sheet with the org's branding.

A Cloud Function (rather than a world-readable rule on `shareLinks`) keeps tenant data structurally non-readable from the public path. The Function is the only thing that ever reads org-scoped data on behalf of an anonymous request.

**Tokens:** 22-char URL-safe random (~128 bits entropy), generated server-side. Not guessable. Stored as-is for v1; whoever has the link gets the data, which is the point.

**File references:** when a shared doc references files (artist photo, tech-rider PDF), the resolver returns short-lived **signed URLs** rather than path strings.

### 8b. Crowd-facing public timetable API

A Cloud Function HTTP endpoint at `https://api.<domain>/v1/event/{publicSlug}/timetable`.

The endpoint reads only the top-level mirror:
```
/publicEvent/{publicSlug}
  ─ orgId, eventId                                (back-pointers; not exposed)
  ─ name: "lila. queer festival 2025"
  ─ dates: { start, end }
  ─ locations: [...]
  ─ days: [{ date, slots: [{ locationId, locationName, start, end, artistName, category, durationMin }] }]
  ─ updatedAt
```

A Firestore `onWrite` trigger on the event + its `timetableEvents` subcollection denormalizes the public slice into `/publicEvent/{slug}` whenever data changes. This means:
1. Crowd traffic never touches org-scoped collections — no risk of accidentally exposing internal fields.
2. The endpoint is cacheable at the CDN layer (`Cache-Control` + `ETag` from `updatedAt`); a slashdot-tier traffic spike doesn't hit Firestore.
3. The org explicitly chooses what gets published. `event.publishToPublic` gates the mirror; when off, the trigger deletes `/publicEvent/{slug}`.

## 9. Modular code structure

Each module — `core`, `artists`, `budget`, `booking`, `riders`, `schedule` — is a Nuxt **layer** in `/layers/<module>/`.

```
/festivalmgr
├── nuxt.config.ts                        (auto-loads ~~/layers/* — no extends: needed)
├── tsconfig.json                         (single root tsconfig in Nuxt 4)
├── app/                                  (root-app entry; minimal — most code lives in layers)
│   └── app.vue                           (wraps <UApp><NuxtPage /></UApp>)
├── netlify.toml
├── firebase.json
├── firestore.rules                       (composed from layer rule fragments)
├── firestore.indexes.json
├── storage.rules
├── /functions                            (Cloud Functions)
│   ├── src/
│   │   ├── index.ts                      (re-exports module functions)
│   │   ├── core/                         (auth callables, membership, mirror writes)
│   │   ├── artists/
│   │   ├── budget/
│   │   └── ...
│   └── package.json
├── /layers
│   ├── /core                             (always loaded; auto-registered, alias #layers/core)
│   │   ├── app/
│   │   │   ├── components/
│   │   │   ├── composables/              (useOrg, useEvent, useUser; wraps VueFire's useFirestore/useCurrentUser)
│   │   │   ├── pages/                    (login, settings, member admin)
│   │   │   └── assets/css/main.css       (@import "tailwindcss"; @import "@nuxt/ui";)
│   │   ├── server/                       (Nitro routes if needed; sibling to app/)
│   │   ├── shared/                       (types shared between app & server; e.g. Org, Event, Membership)
│   │   ├── firestore.rules.frag
│   │   └── nuxt.config.ts
│   ├── /artists                          (first module to be brainstormed and built)
│   ├── /budget
│   ├── /booking
│   ├── /riders
│   └── /schedule
└── /scripts
    ├── seed-director.ts
    └── compose-rules.ts                  (concatenates rules.frag → firestore.rules)
```

**Why Nuxt layers (not just folders):**
1. Real boundaries — a layer can't accidentally import another layer's internals; consumers go through public composables/types.
2. Per-org module enable/disable becomes a tree-shake-friendly config change. For v1 all layers ship in the bundle and the UI hides modules absent from `org.enabledModules`; per-org bundling can be added later if it ever matters.
3. A layer can be lifted into its own npm package when needed.
4. Auto-registration: every directory under `~~/layers/` is loaded automatically (Nuxt ≥3.12) and exposed via the `#layers/<name>` alias (Nuxt ≥3.16). No `extends:` plumbing needed for local layers.

**Layer dependency rule:** `core ← module`, never `module ← module`. A layer's public API is its `shared/` types and `app/composables`; pages and components are consumed across layers but never imported into another layer's *internals*. When module A needs derived data from module B, the integration goes through Firestore (B writes, A subscribes), not direct imports.

**Rule composition:** each layer ships a `firestore.rules.frag` covering only its own collections. A `compose-rules.ts` script concatenates fragments into the root `firestore.rules` at build/deploy time. Same pattern for `storage.rules`. Module rules live next to module code.

## 10. Security rules approach

In Approach 1, **rules are the permission system** — not a defense-in-depth layer behind server code. They get real care.

### Layered structure
Each module's `firestore.rules.frag` is concatenated into the root rules file with shared helpers at the top.

```js
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    function isSignedIn()     { return request.auth != null; }
    function claimOrgId()     { return request.auth.token.orgId; }
    function claimRole()      { return request.auth.token.role; }
    function inOrg(orgId)     { return isSignedIn() && claimOrgId() == orgId; }
    function hasRole(roles)   { return isSignedIn() && claimRole() in roles; }

    match /users/{uid} {
      // self-read, or read by anyone in the same org (so UIs can render
      // "invited by Sarah" with name + avatar). Tenant isolation enforced
      // structurally via the denormalized User.orgIds list.
      allow read:  if isSignedIn() && (
                     request.auth.uid == uid ||
                     claimOrgId() in resource.data.orgIds
                   );
      allow write: if request.auth.uid == uid;   // user can only edit own profile
    }

    match /organizations/{orgId} {
      allow read:  if inOrg(orgId);
      allow write: if inOrg(orgId) && hasRole(['director']);

      match /memberships/{userId} {
        allow read:  if inOrg(orgId);
        allow write: if false;                 // only via Cloud Function
      }

      // ─── core layer fragment ───
      match /events/{eventId} {
        allow read:   if inOrg(orgId);
        allow create, update: if inOrg(orgId) && hasRole(['director','booker','production']);
        allow delete: if inOrg(orgId) && hasRole(['director']);

        match /locations/{locationId} {
          allow read:  if inOrg(orgId);
          allow write: if inOrg(orgId) && hasRole(['director','production']);
        }
      }

      match /shareLinks/{token} {
        allow read:  if inOrg(orgId);
        allow write: if inOrg(orgId) && hasRole(['director','booker','pr']);
      }

      // ─── module fragments inserted here at build time ───
    }

    match /publicEvent/{slug} {
      allow read:  if true;                    // world-readable, intentionally
      allow write: if false;                   // only via onWrite trigger
    }
  }
}
```

### Validation

- **Structural validation** (required fields, allowed types, allowed enums) lives in rules. Per-collection helpers like `isValidEvent(d)` keep this readable.
- **Business validation** (cross-doc consistency) is best-effort in the client.
- **Trusted-only writes** (claim sync, public mirror, share-link resolution) go through Cloud Functions.

### Testing — non-negotiable

- **Tooling:** `@firebase/rules-unit-testing` SDK against the local Firestore emulator.
- **Per-module test file:** `/layers/<module>/test/firestore.rules.test.ts`.
- **Required coverage per collection:**
  1. Happy path (allowed roles).
  2. **Cross-tenant isolation** — user in org A cannot read/write anything under org B.
  3. Role boundaries (e.g., crew cannot edit, finance cannot edit artists).
  4. Anonymous denial (except `/publicEvent/`).
  5. Field-level constraints (invalid enum, missing required field).
- **CI gate:** rule tests run in GitHub Actions on every PR.
- **Predeploy gate:** `firebase deploy` runs `npm run rules:check` (compose + test) and aborts on failure.

## 11. Local dev, environments, deploy

### Local
- **Firebase Emulator Suite** for Firestore + Auth + Functions + Storage. VueFire's `vuefire.emulators` config block in `nuxt.config.ts` points the client at the emulators when `FIREBASE_USE_EMULATOR=1`.
- Seed scripts populate a fake org, a director user, and a handful of fake artists for offline development.

```
npm run dev          # emulators + Nuxt dev server in parallel
npm run dev:seed     # reset emulator and reseed
npm run rules:check  # compose + test rules against emulator
npm run test         # vitest + rules tests
```

### Environments

| Project | Purpose |
|---|---|
| `festivalmgr-dev` | Type/config target for emulators. Never deployed to. |
| `festivalmgr-staging` | Real Firebase project. PR previews and pre-prod testing. |
| `festivalmgr-prod` | Production. Manually-triggered deploy. |

Project switching via `firebase use <alias>` from `.firebaserc`.

### Deploy pipeline (GitHub Actions)
- PR opened → Netlify preview build + emulator-based rules tests.
- PR merged to `main` → staging deploy auto-runs.
- Manual workflow dispatch → prod deploy: rules tests → Nuxt build → Functions deploy → rules deploy → indexes deploy → Netlify production build, in order; any failure aborts.

### Backups
Daily Firestore export to a Cloud Storage bucket, 30-day retention.

## 12. Internationalization

- **Default locale:** `en`. German and other locales added later.
- **Tooling:** `@nuxtjs/i18n` with a per-layer `locales/` directory.
- **UI strings** are translated; user-entered content (artist bios, notes) is stored as-typed.
- **Date / time / currency** formatting follows `Organization.defaultLocale` and `defaultCurrency`.

## 13. Module roadmap (post-foundation)

Each module = its own brainstorm → spec → plan → implement cycle. **One module at a time, not parallel.**

1. **Artist Management** — replaces the spreadsheet. Most painful current workflow; unlocks the others.
2. **Schedule / Daysheets** — once artists exist, slot them onto the timetable. Daysheets generated from schedule + per-artist hospitality info.
3. **Booking / Advancing** — formalize advancing on top of artists + status flow.
4. **Riders / PR** — file management for techriders, contracts, press materials.
5. **Budget** — most complex; built after Artists + Schedule give it real data.

## 14. Open questions / decisions deferred to module specs

- **Artist module:** the lila25 spreadsheet defines a rich field set (category, status flow, fees, accommodation, FLINTA quotas, production checklist, contact, etc.). All of these are designed in the Artist Management brainstorm session — not here.
- **Budget module:** category sub-totals, currency overrides, the Swiss-contract reserve mechanic, plan-vs-actual reconciliation, and payouts are designed in the Budget brainstorm session. The top-level `Event` deliberately does NOT carry budget fields.
- **Schedule module:** the `TimetableEvent` shape (`startsAt`, `durationMin`, `locationId`, `artistId`, plus likely break/changeover/announcement variants) is designed in the Schedule brainstorm.
- **Cross-module integration:** patterns for B-derives-from-A flows (e.g., budget items derived from confirmed artist fees) are decided per-module. The platform contract is "modules communicate through Firestore writes, not direct imports."

## 15. First implementation slice (the platform foundation MVP)

The platform foundation that gets implemented before any module work:

1. Repo scaffold: Nuxt 4 project (`npx nuxi@latest init`), Firebase project, `layers/` directory, `functions/` directory, `firebase.json`, `.firebaserc`, `netlify.toml`.
2. UI baseline: install `@nuxt/ui` + `tailwindcss` (v4); add `app/assets/css/main.css` with `@import "tailwindcss"; @import "@nuxt/ui";`; wrap `app.vue` in `<UApp><NuxtPage /></UApp>`.
3. Firebase glue: install `nuxt-vuefire` (and `firebase`, plus `firebase-admin` for SSR share-link pages); add `vuefire` config block to `nuxt.config.ts` with project credentials, `auth.enabled: true`, and emulator wiring gated on `FIREBASE_USE_EMULATOR=1`.
4. `core` layer: `Org`, `Membership`, `Event`, `Location`, `User` types in `layers/core/shared/types/`; basic CRUD composables (`useOrg`, `useEvent`) in `layers/core/app/composables/` wrapping VueFire's `useDocument`/`useCollection`; login pages (magic-link + Google) and member-admin pages in `layers/core/app/pages/`.
5. Auth flow end-to-end: magic-link, Google, custom-claim sync via `setMembership` Cloud Function, seed-director script.
6. `compose-rules.ts` script + initial `firestore.rules` covering Org, Membership, Event, and Location.
7. Rules tests for all of the above (happy paths, cross-tenant denial, role boundaries, anonymous denial, field-level constraints).
8. Local emulator dev workflow: `npm run dev`, `dev:seed`, `rules:check`.
9. CI: GitHub Actions for PR rules tests + Netlify previews; manual workflow_dispatch for staging and prod deploys.
10. Backups: daily Firestore export configured in prod.

**Deferred from the MVP** (designed in §5 / §8 for forward-compat, implemented later):

- Per-document share-links (`shareLinks` collection, `resolveShareLink` Cloud Function, `/s/[token].vue` public page).
- Public crowd-API mirror (`/publicEvent/{slug}` denormalized doc, `onWrite` trigger maintaining it, HTTP endpoint reading it, the world-readable rule).
- The `Event.publishToPublic` and `Event.publicSlug` fields stay in the type as forward-compat but are unused in MVP.

Once the MVP lands, the **Artist Management module** is the next brainstorm.
