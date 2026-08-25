# Options Trade Analyzer

A private, advisory-only Phase One analyzer for manually pasted long-call and long-put alerts. It confirms the contract, applies an options-only risk budget, requires fresh user-entered prices for zero- and one-DTE trades, and explains a `Consider`, `Wait`, or `Pass` verdict as evidence strength—not probability of profit.

The application never connects to a brokerage, places an order, monitors a position, or promises a return.

## Phase One capabilities

- Passwordless Supabase authentication and per-user row-level security.
- Options-only budget setup with one-to-three-contract limits and risk tiers: up to 1% normal, above 1% through 2% caution, and above 2% `Too aggressive`.
- Manual private-alert intake with raw text and corrected ticker, call/put, strike, expiration, and premium preserved separately.
- Scoring blocked until ticker, side, strike, and expiration are confirmed.
- User-confirmed option premium and underlying price required for zero- and one-DTE analysis.
- Transparent evidence factors, sources, timestamps, and exact `Consider` / `Wait` / `Pass` verdicts.
- Purchased, Skipped, and Wait-only Saved for review decisions.
- Manual Wait-candidate refresh that preserves the original analysis and displays before/current evidence and timestamps before another decision.

## Local quick start

Prerequisites: Node.js 24+, pnpm 11, Docker Desktop, and a running Docker engine.

```powershell
pnpm install
pnpm exec supabase start
pnpm exec supabase status -o env
Copy-Item .env.example .env.local
```

Replace the two Supabase values in `.env.local` with `API_URL` and `ANON_KEY` from the status output, then apply a clean local schema and run the app on port 3001:

```powershell
pnpm exec supabase db reset
pnpm dev -- --hostname 127.0.0.1 --port 3001
```

Open `http://127.0.0.1:3001`. Passwordless sign-in emails appear in local Mailpit at `http://127.0.0.1:54324`.

`supabase db reset` deletes local application/auth data before replaying migrations. Do not point reset commands at a shared or production project.

## Verification

```powershell
pnpm test
pnpm test:e2e
pnpm test:a11y
pnpm lint
pnpm typecheck
pnpm build
pnpm exec supabase test db
```

`test:e2e` runs the real passwordless login through the local Mailpit API with unique disposable addresses. It runs serial desktop Chromium and mobile WebKit projects on `http://127.0.0.1:3001`, exercises persisted Supabase records without an auth bypass, and includes axe checks requiring zero serious or critical violations. Failure screenshots, videos, and traces are written under the operating system temp directory rather than committed source.

On managed Windows shells where the pnpm wrapper cannot reuse the existing module store, the equivalent direct executables are available under `node_modules/.bin`.

## Safety and scope

Manual snapshots are user assertions, not live market data. For zero- and one-DTE contracts, both current premium and underlying are mandatory and the full premium controls risk. A saved candidate refresh is manual and does not automatically reevaluate, notify, or act. A future 30% premium-decline signal may only request human review; it must never become an automatic exit.

Raw alerts and derived records are private financial-workflow data. Use an isolated Supabase project, retain RLS, expose only the public/anonymous browser key, and never put a service-role key in browser code or Playwright storage.

See [docs/phase-1-operations.md](docs/phase-1-operations.md) for local reset, environment, deployment, and non-local E2E procedures.

## Explicitly deferred to Phase Two

Automatic candidate monitoring, browser/mobile push, live quote ingestion, position monitoring, automatic exits, trade reconciliation, host follow-ups, and performance analytics are out of scope.
