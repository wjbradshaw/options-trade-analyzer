# Phase One operations

This runbook covers the authenticated Phase One entry analyzer. Commands assume the repository root and PowerShell.

## 1. Prerequisites

- Node.js 24 or newer and pnpm 11.
- Docker Desktop with the Docker engine running.
- Playwright Chromium and WebKit browser builds for E2E.
- For deployment, a dedicated Supabase project with email authentication enabled.

Install dependencies and browsers:

```powershell
pnpm install
pnpm exec playwright install chromium webkit
```

The checked-in application never needs a Supabase service-role key. Do not add one to `.env.local`, public variables, browser code, test storage state, or deployment client configuration.

## 2. Start and discover the local Supabase environment

Start the Docker-backed stack and inspect its current endpoints and keys:

```powershell
pnpm exec supabase start
pnpm exec supabase status -o env
```

The standard local endpoints are:

- API and Auth: `http://127.0.0.1:54321`
- Postgres: `127.0.0.1:54322`
- Studio: `http://127.0.0.1:54323`
- Mailpit UI/API: `http://127.0.0.1:54324`

Copy `.env.example` to `.env.local`. Set:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY from supabase status>
```

These `NEXT_PUBLIC_` values are bundled into browser JavaScript by Next.js. For production, they must be correct at build time. The anonymous key is designed for public clients; authorization still depends on Supabase Auth and the checked-in RLS policies.

## 3. Apply migrations and test database policy

A clean reset re-creates local data, applies `supabase/migrations/0001_phase1.sql` and `0002_analysis_workflow_rpc.sql` in order, and deletes all existing local auth/application records:

```powershell
pnpm exec supabase db reset
pnpm exec supabase test db
```

The pgTAP suite validates privileges, tenant isolation, confirmed-contract enforcement, one-to-three purchase quantities, Wait-candidate integrity, and transaction RPC permissions. Run both commands after any migration or RPC change.

For an already-running local database where data must be retained, review pending migrations before using the CLI migration-up workflow. For a remote deployment, link only the intended Supabase project, review the target, and use `supabase db push`; never use `db reset` against shared or production data.

## 4. Run the application

Port 3001 is the supported local and E2E port for this repository:

```powershell
pnpm dev -- --hostname 127.0.0.1 --port 3001
```

Open `http://127.0.0.1:3001`. Enter an email on the passwordless login page, open Mailpit at `http://127.0.0.1:54324`, and follow the newest sign-in link for that address.

Next.js 16 currently emits a known warning that the `middleware.ts` convention is deprecated in favor of `proxy.ts`. Authentication still works; migration of that convention is not part of Phase One.

## 5. Unit, component, E2E, and accessibility verification

```powershell
pnpm test
pnpm test:e2e:desktop
pnpm test:e2e:mobile
pnpm test:e2e
pnpm test:a11y
pnpm lint
pnpm typecheck
pnpm build
```

`test:e2e` starts Next.js explicitly at `http://127.0.0.1:3001`, then runs one worker so desktop and mobile project records cannot race. Every project creates a unique disposable `@example.test` user through the real login UI, conditionally polls Mailpit's API for the matching message, and follows the one-time link. There is no production auth bypass, persistent test route, service-role browser key, fixed user, or arbitrary sleep.

The E2E safety matrix covers:

- unauthenticated dashboard redirect and a newly authenticated user with no profile;
- missing side and ambiguous update-like alert text;
- dynamic current-date zero-DTE missing prices and one-DTE stale evidence;
- risk above 2% producing `Too aggressive` and `Pass`;
- a client-visible trader-repository failure produced by intercepting only its Supabase REST request;
- the complete budget, trader, SPX, confirmation, snapshot, analysis, Save for review, changed-evidence refresh, and purchase flow;
- visible advisory copy with no guaranteed-return or automatic-execution promise.

The happy path runs `@axe-core/playwright` on login, alert intake, corrected editor, analysis, and purchase-decision states and fails on any serious or critical violation. `test:a11y` runs that axe-bearing journey in both configured projects.

Artifacts use the operating-system temp directory, normally:

```text
%TEMP%\options-trade-analyzer-playwright
```

Failed retries retain screenshots, video, and a first-retry trace. Successful happy paths also retain a final purchase screenshot for operator review. Artifacts are intentionally outside Git.

If a managed Windows pnpm wrapper aborts before dispatching a script, run the project executable directly, for example:

```powershell
node_modules\.bin\vitest.cmd run
node_modules\.bin\playwright.cmd test
node_modules\.bin\eslint.cmd .
node_modules\.bin\tsc.cmd --noEmit
node_modules\.bin\next.cmd build
```

## 6. Data reset and cleanup

For a clean local environment:

```powershell
pnpm exec supabase db reset
```

This is destructive to local users, alerts, snapshots, analyses, candidates, and decisions. E2E uses unique users, so routine runs do not need a reset. Reset when validating migrations or deliberately returning to an empty local state.

Stop local services when finished:

```powershell
pnpm exec supabase stop
```

## 7. Non-local E2E prerequisites

The default suite is intentionally local. To point it elsewhere, use an isolated test project and set:

```dotenv
E2E_SUPABASE_URL=https://<isolated-test-project>.supabase.co
E2E_SUPABASE_ANON_KEY=<isolated test anonymous key>
E2E_MAILPIT_URL=https://<Mailpit-compatible test inbox API>
```

The environment must allow disposable user creation, expose a Mailpit-compatible `/api/v1/messages` and `/api/v1/message/{id}` API, and allow the exact callback `http://127.0.0.1:3001/auth/callback`. Do not target production users, production mail, or production data. The suite will not use a service-role key or direct user creation as a substitute for the login UI.

## 8. Deployment prerequisites

Before deployment:

1. Provision an isolated hosted Supabase project and apply both migrations.
2. Run pgTAP against a safe verification database and review all RLS/policy results.
3. Configure the hosted project URL and anonymous key as build-time `NEXT_PUBLIC_` variables.
4. Add the exact HTTPS application `/auth/callback` URL to Supabase Auth redirect allowlists and set the application site URL consistently.
5. Configure a production email provider, sender identity, expiration, and rate limits for passwordless links.
6. Build with the production public environment, then run lint, typecheck, unit/component tests, and a production smoke test.
7. Confirm HTTPS, secure cookie behavior, log/retention policy, database backups, and least-privilege operator access.
8. Confirm no service-role key or private alert content is present in browser bundles, logs, analytics, or test artifacts.

## 9. Manual snapshot and advisory limitations

- The product has no live quote feed. Premium and underlying values are user-entered assertions.
- Zero- and one-DTE scoring requires both prices and rejects evidence older than 15 minutes.
- Full contract premium controls short-DTE risk even if the user enters a smaller planned loss.
- The score reports evidence strength and must never be represented as win rate or probability of profit.
- A Wait refresh is initiated manually. It preserves the source analysis, conditions, and timestamp; writes a new snapshot/analysis; and shows before/current evidence without background reevaluation.
- Purchased and Skipped are user records, not orders. No brokerage execution occurs.
- A 30% premium decline is, at most, a future review alert. It must never trigger an automatic sale or exit.

Raw alerts can contain private financial intent. Keep them within the authenticated user's RLS-protected tenant, collect only the options budget needed for risk checks, and establish an explicit retention/deletion policy before production use. This tool is educational/advisory software, not individualized investment advice or a guarantee of results.

## 10. Explicit Phase Two deferrals

Do not add any of the following as an operational shortcut or deployment hook in Phase One:

- automatic candidate or quote monitoring;
- browser, mobile, email, or host push follow-ups;
- live position or premium monitoring;
- automatic entry, exit, adjustment, or brokerage connection;
- trade reconciliation, performance analytics, or automated journaling;
- background reevaluation of saved candidates.

Each requires a separately approved plan, privacy review, and safety model.
