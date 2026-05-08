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
