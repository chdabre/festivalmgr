# festivalmgr — Foundation Completion (Rules + CI) Design

**Status:** Draft for approval
**Date:** 2026-05-09
**Scope:** Plan B of the platform-foundation MVP — finishing items 6, 7, and (a partial slice of) 9 from [`2026-05-08-festivalmgr-platform-foundation-design.md` §15](2026-05-08-festivalmgr-platform-foundation-design.md). Items 9 (deploy workflows / Netlify production config) and 10 (daily Firestore backups) remain for Plan C.

## 1. Overview

Plan A shipped the Nuxt + Firebase scaffold, the `core` layer, the membership Cloud Functions, the auth UI, and the dev workflow against the emulator — but with permissive starter rules, no rules tests, and no continuous integration. This plan replaces the permissive rules with the layered, role-aware rule set described in §10 of the foundation spec, adds the rules-unit-test suite, and adds a single GitHub Actions workflow that runs every existing check (typecheck, composable tests, function tests) plus the new rules tests on every PR.

The architectural pattern stays the same as Plan A: rules are the permission system, not a defense-in-depth layer behind server code. They get real care.

## 2. Goals and non-goals

### Goals
- Replace the permissive `firestore.rules` with the §10 role-aware rule set, scoped to the collections that exist today (`users`, `organizations`, `memberships`, `events`, `locations`) plus forward-compat deny-by-default rules for `shareLinks` and `publicEvent`.
- Introduce the layered rule-fragment build pipeline (`scripts/compose-rules.ts` + `layers/<name>/firestore.rules.frag`) so future module rules slot in without touching the composer.
- Lock storage down to a deny-all stub with the same fragment-and-compose pattern; module specs that introduce uploads (Riders, Artists) own the path design.
- Ship a rules-unit-test suite at `layers/core/test/firestore.rules.test.ts` that covers happy path, cross-tenant denial, role boundaries, anonymous denial, and field-level constraints (level B per the brainstorming session — required keys, enum membership, slug immutability, type checks on fields the rules reference).
- Ship a single GitHub Actions workflow that runs `typecheck`, `test`, `test:functions`, and the new `rules:check` on every PR and `main` push.
- Block `firebase deploy --only firestore` and `--only storage` from shipping without first running `rules:check`.

### Non-goals (deferred to Plan C / module specs)
- **Manual `workflow_dispatch` deploy workflows** for staging and prod — Plan C.
- **Netlify production configuration** (env vars, hosting, domain) — Plan C.
- **Daily Firestore backups** to Cloud Storage — Plan C.
- **Module-specific rule fragments** for `artists`, `budget`, `booking`, `riders`, `schedule` — each module's own brainstorm/spec/plan.
- **Storage rules for branding, riders, contracts, photos** — deferred to the modules that introduce those paths. Plan B ships a deny-all stub.
- **Per-document share-links and the public crowd-API mirror** — explicitly deferred in foundation §15. The rules for `shareLinks` and `publicEvent` paths are included in the rule set verbatim from foundation §10 (forward-compat, deny-on-write), but the resolver Function and onWrite trigger are not implemented.

## 3. Architecture

Three orthogonal additions to Plan A's repo:

```
┌─────────────────────────────────────────────────────────────────┐
│ Rule sources (per-layer fragments)                              │
│                                                                 │
│   layers/core/firestore.rules.frag   (committed)                │
│   layers/core/storage.rules.frag     (committed; deny-all)      │
│                                                                 │
│   ↓ scripts/compose-rules.ts (deterministic concat + envelope)  │
│                                                                 │
│   firestore.rules                    (committed; AUTO-GENERATED)│
│   storage.rules                      (committed; AUTO-GENERATED)│
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Rules tests (vitest + @firebase/rules-unit-testing)             │
│                                                                 │
│   layers/core/test/firestore.rules.test.ts                      │
│   layers/core/test/storage.rules.test.ts                        │
│                                                                 │
│   ↓ vitest.config.rules.ts (separate config, node env)          │
│                                                                 │
│   pnpm rules:test  →  firebase emulators:exec --only            │
│                       firestore,storage  'vitest run …'         │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Continuous integration                                          │
│                                                                 │
│   .github/workflows/ci.yml                                      │
│   pnpm install → functions build → typecheck → test →           │
│                  test:functions → rules:check                   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Deploy gate                                                     │
│                                                                 │
│   firebase.json (firestore.predeploy, storage.predeploy)        │
│      → pnpm rules:check                                         │
└─────────────────────────────────────────────────────────────────┘
```

## 4. Rule composition pipeline

**`scripts/compose-rules.ts`** is invoked by `pnpm rules:compose` (and indirectly by `pnpm rules:check` and the `firebase deploy` predeploy hook). It is a thin TypeScript script run via `tsx`:

1. Discovers `layers/*/firestore.rules.frag` and `layers/*/storage.rules.frag`. Order is deterministic: `core` first, then alphabetical for everything else.
2. For each compose target, emits an outer envelope:
   - For Firestore: `rules_version = '2'; service cloud.firestore { match /databases/{database}/documents { … } }` with the shared helpers (`isSignedIn`, `claimOrgId`, `claimRole`, `inOrg`, `hasRole`) defined at the top of the inner `match`.
   - For Storage: `rules_version = '2'; service firebase.storage { match /b/{bucket}/o { … } }`.
3. Concatenates each fragment's body inside the inner match block, separated by horizontal-rule comments (`// ─── core layer fragment ───`).
4. Writes the composed file with a leading banner: `// AUTO-GENERATED by scripts/compose-rules.ts. Edit layers/<name>/firestore.rules.frag instead.`
5. Hard-fails (non-zero exit) if any fragment contains a `service` or `rules_version` token (would emit a duplicate envelope).

**Fragment format:**
- A `.rules.frag` file emits **only** match blocks and per-collection helper functions (e.g. `isValidEvent(d)`).
- Top-level paths (e.g. `users/{uid}`, `publicEvent/{slug}`) and org-scoped paths (`organizations/{orgId}/...`) live in the same fragment — the composer doesn't try to be clever about path scoping.
- Per-fragment helpers are scoped to the inner `match` block by the composer (no global namespace pollution between fragments).

**Composed-files-are-committed:** `firestore.rules` and `storage.rules` are checked in (with the AUTO-GENERATED banner). Reasons:
- `firebase deploy` works without first running compose.
- Reviewers see the diff that actually ships.
- The commit hook (next section) regenerates them, so drift between source and committed file is caught locally and in CI.

## 5. Rule content

The shared helpers — defined once by the composer at the top of the inner `match`:

```js
function isSignedIn()    { return request.auth != null; }
function claimOrgId()    { return request.auth.token.orgId; }
function claimRole()     { return request.auth.token.role; }
function inOrg(orgId)    { return isSignedIn() && claimOrgId() == orgId; }
function hasRole(roles)  { return isSignedIn() && claimRole() in roles; }
```

`core/firestore.rules.frag` declares the per-entity validators inline above its match blocks:

```js
function isValidOrganization(d) {
  return d.keys().hasAll(['name','slug','defaultLocale','defaultCurrency','enabledModules','createdAt'])
      && d.name is string && d.slug is string
      && d.defaultLocale is string && d.defaultCurrency is string
      && d.enabledModules is list;
}
function isValidEvent(d) {
  return d.keys().hasAll(['name','slug','primaryLocale','status','dates','publishToPublic','createdAt'])
      && d.status in ['planning','live','archived']
      && d.dates.start is timestamp && d.dates.end is timestamp
      && d.publishToPublic is bool;
}
function isValidLocation(d) {
  return d.keys().hasAll(['name','order'])
      && d.name is string && d.order is int;
}
function slugUnchanged(field) {
  return request.resource.data[field] == resource.data[field];
}
```

Per-collection rules:

| Path | Read | Create | Update | Delete |
|---|---|---|---|---|
| `users/{uid}` | self **or** `claimOrgId() in resource.data.orgIds` | self only | self only | denied |
| `organizations/{orgId}` | `inOrg(orgId)` | denied (server-only via seed) | `inOrg(orgId) && hasRole(['director']) && isValidOrganization(req) && slugUnchanged('slug')` | denied |
| `…/memberships/{userId}` | `inOrg(orgId)` | denied (server-only) | denied | denied |
| `…/events/{eventId}` | `inOrg(orgId)` | `inOrg(orgId) && hasRole(['director','booker','production']) && isValidEvent(req)` | same as create + `slugUnchanged('slug')` | `inOrg(orgId) && hasRole(['director'])` |
| `…/events/{e}/locations/{l}` | `inOrg(orgId)` | `inOrg(orgId) && hasRole(['director','production']) && isValidLocation(req)` | same as create | same as create |
| `…/shareLinks/{token}` | `inOrg(orgId)` | `inOrg(orgId) && hasRole(['director','booker','pr'])` | same | same |
| `publicEvent/{slug}` (top-level) | **anyone** (intentional) | denied | denied | denied |

Notes:
- **Org create/delete are denied for everyone.** Orgs are seeded server-side via `scripts/seed-director.ts` (Admin SDK; bypasses rules). Updates are director-only.
- **Memberships are 100% server-only.** The `setMembership` / `revokeMembership` / `claimMembership` Cloud Functions write them via the Admin SDK. Plan A's UI already never writes them; the rule makes it impossible to bypass.
- **`slug` immutability** is enforced on update for both `Organization` and `Event` (slugs are immutable per foundation §6 because URLs and storage paths depend on them).
- **`users/{uid}` writes are loose** beyond the self-only check. Plan A's `claimMembership` function maintains `orgIds` server-side; the rule needs to permit self-edits to display name / photo URL.

`core/storage.rules.frag` is a deny-all stub:

```js
match /{allPaths=**} {
  allow read, write: if false;
  // Path-specific writes are introduced by module fragments
  // (Riders for tech-rider PDFs, Artists for press photos, Org for branding/logoStoragePath).
}
```

## 6. Tests

`@firebase/rules-unit-testing` ships a typed test client that stamps fake ID tokens with arbitrary custom claims. Tests run against the local Firestore emulator via `firebase emulators:exec`, which boots a clean instance per run.

**Test scaffolding** lives in `layers/core/test/helpers/rules-env.ts`:
- `setupRulesEnv()` — bootstraps the test environment with the composed `firestore.rules`.
- `actingAs({ uid, orgId, role, orgIds? })` — returns an `assertSucceeds`/`assertFails`-ready Firestore handle authenticated as a user with those claims.
- `actingAsAnon()` — unauthenticated handle.
- Per-test seed helpers that bypass rules via the `withSecurityRulesDisabled` channel to set up fixtures.

**Test files:**
- `layers/core/test/firestore.rules.test.ts` — one `describe` block per collection.
- `layers/core/test/storage.rules.test.ts` — verifies deny-all (anon, signed-in director, cross-tenant director).

**Coverage matrix (Firestore):**

| Collection | Cases (≈) |
|---|---|
| `users/{uid}` | self read ✓ / same-org-member read ✓ / cross-org member read ✗ / anon read ✗ / non-self write ✗ / self write ✓ |
| `organizations/{orgId}` | member read ✓ / cross-tenant read ✗ / anon read ✗ / director update ✓ / non-director update ✗ / slug change ✗ / missing required field ✗ |
| `memberships/{userId}` | member read ✓ / cross-tenant read ✗ / any client write ✗ (director, crew, anon) |
| `events/{eventId}` | member read ✓ / cross-tenant read ✗ / director create ✓ / booker create ✓ / production create ✓ / pr create ✗ / crew create ✗ / director delete ✓ / booker delete ✗ / slug change on update ✗ / invalid status enum ✗ / missing required field ✗ |
| `locations/{locationId}` | member read ✓ / director write ✓ / production write ✓ / booker write ✗ / crew write ✗ / cross-tenant write ✗ / missing `order` ✗ |
| `shareLinks/{token}` | member read ✓ / cross-tenant read ✗ / anon read ✗ / director write ✓ / booker write ✓ / pr write ✓ / crew write ✗ |
| `publicEvent/{slug}` | anon read ✓ / authenticated client write ✗ |

≈40 cases total. Each ~50ms; whole suite runs in seconds.

**Vitest configuration:** Plan A's `vitest.config.ts` uses `happy-dom` for composable tests. Rules tests need `node` + a longer hook timeout (emulator boot inside `firebase emulators:exec` adds ~5s before the suite starts, but that's outside the per-test budget). A separate `vitest.config.rules.ts` keeps the two test surfaces independent. The rules test config:
- `environment: 'node'`
- `include: ['layers/**/test/**/*.test.ts']`
- `testTimeout: 10_000`
- `hookTimeout: 30_000`

The existing root `vitest.config.ts` continues to drive composable tests under `tests/composables/**`.

## 7. CI workflow

`.github/workflows/ci.yml` is a single-job, sequential workflow:

```yaml
name: ci
on:
  pull_request:
  push: { branches: [main] }
jobs:
  check:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 10 }
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: 21
      - uses: actions/cache@v4
        with:
          path: ~/.cache/firebase
          key: firebase-emulators-${{ runner.os }}-v1
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter ./functions build
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm test:functions
      - run: pnpm rules:check
```

**Decisions baked in:**
- **Ubuntu runners** — free, fast, sufficient.
- **Node 22** — matches `functions/package.json` `engines.node`.
- **Java 21 (Temurin)** — matches the Firebase Tools 15+ requirement we already discovered locally.
- **One sequential job** — failures abort downstream steps, output is contiguous in the PR check view, dependency caching pays off across all steps. Splitting later is easy if a step becomes a bottleneck.
- **Functions build before typecheck** — root `pnpm typecheck` includes `functions/typecheck`, but `firebase emulators:exec` later loads the functions emulator from `functions/lib/`; pre-building keeps that path clean (Plan A learned this).
- **`~/.cache/firebase` is cached** — emulator binaries are ~250 MB; cache keeps subsequent runs fast.
- **No deploy steps** — Plan C adds the manual `workflow_dispatch` deploy workflows.

## 8. Deploy gate

`firebase.json` gains `predeploy` hooks for both `firestore` and `storage`:

```json
"firestore": {
  "rules":   "firestore.rules",
  "indexes": "firestore.indexes.json",
  "predeploy": ["pnpm rules:check"]
},
"storage": {
  "rules":   "storage.rules",
  "predeploy": ["pnpm rules:check"]
}
```

`firebase deploy --only firestore` (or `--only storage`) now runs `pnpm rules:check` first; failure aborts the deploy. The hook is intentionally `rules:check` (compose + test), not just `rules:compose` — we want a deploy to fail if the tests fail, not just if the compose step does.

## 9. Migration impact on Plan A

Plan A has an open issue that Plan B fixes by changing the rules: any client that doesn't include `orgId` and `role` claims on its ID token will be denied by every per-org match. Plan A's auth flow already mints these claims via `setMembership` / `claimMembership`, so this is a no-op for the happy path. The one exception:

- **Anonymous reads of public collections.** Today, Plan A has none — every page is auth-gated. The rule for `publicEvent/{slug}` is forward-compat for the public crowd API; no Plan A surface uses it.

A no-changes-needed list confirms compatibility:
- Plan A's `claimMembership` returns `{ activatedOrgIds }` and updates the `User.orgIds` array — the rule for `users/{uid}` reads exactly this field.
- Plan A's `setMembership` writes membership docs via the Admin SDK — bypasses the `allow write: if false` rule on `memberships`.
- Plan A's `useEvents`/`useEvent`/`useLocations` composables run as `inOrg(orgId)` users — the new read rules permit them.
- Plan A's settings page writes only when the current user has the `director` role — the new update rule permits it.

The settings page does write `Organization` updates client-side, so the `isValidOrganization` validator's required-field list must match what Plan A actually writes. The plan's first verification step confirms this against the running app.

## 10. Out-of-scope items (explicit)

For clarity — the following items are **not** changed by Plan B:
- Cloud Functions code (no Function-side changes; the rules tighten what the client can do, not the server).
- Auth UI, login flow, sessionCookie wiring (all Plan A).
- The dev script (`pnpm dev`) and emulator setup (Plan A).
- The composable APIs (`useOrg`, `useEvent`, `useEvents`, `useLocations`, `useMemberships`).
- The seed scripts (Plan A; they use the Admin SDK and bypass rules).

## 11. First implementation slice

The plan that flows from this design covers, in order:
1. Repo prep — install `@firebase/rules-unit-testing`, scaffold `scripts/compose-rules.ts`, scaffold `vitest.config.rules.ts`, scaffold `layers/core/test/helpers/`.
2. Author `core/firestore.rules.frag` with helpers and validators.
3. Run `pnpm rules:compose`, replace permissive `firestore.rules` with the composed version.
4. Author the rules-test suite collection by collection, watching it go red→green.
5. Author `core/storage.rules.frag` (deny-all stub) + storage rules tests.
6. Wire `pnpm rules:compose` / `rules:test` / `rules:check` into `package.json`.
7. Add `firebase.json` predeploy hooks.
8. Add `.github/workflows/ci.yml`.
9. Run the full smoke check: `pnpm rules:check` locally, push a PR branch, watch CI go green.
