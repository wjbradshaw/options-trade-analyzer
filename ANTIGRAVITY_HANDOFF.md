# Options Trade Analyzer — Antigravity handoff

Last updated: 2026-08-28

## Resume point

Phase One is implemented through Task 10 fix round 1 on branch `phase-1-entry-analyzer`. The verified committed head is:

```text
08fabdd fix: resolve task 10 review findings
```

Do not reset, clean, or discard the working tree. Task 10 fix round 2 is intentionally paused with draft, uncommitted work:

```text
 M docs/phase-1-operations.md
 M next-env.d.ts
?? supabase/migrations/0004_candidate_refresh_lock.sql
?? supabase/tests/phase1_candidate_concurrency_test.sql
```

`next-env.d.ts` is generated Next.js dev churn and must be restored by the final production build; do not hand-edit or commit its current `.next/dev` imports.

No remote push, merge, deployment, or Phase Two feature has been performed.

## Read before changing code

1. Repository instructions: `AGENTS.md` and `CLAUDE.md`.
2. Approved design: `C:\Users\rjsc\Documents\Codex\2026-08-14\realtime-voice-chat-4\docs\superpowers\specs\2026-08-14-options-trade-analyzer-design.md`.
3. Approved plan: `C:\Users\rjsc\Documents\Codex\2026-08-14\realtime-voice-chat-4\docs\superpowers\plans\2026-08-14-phase-1-entry-analyzer-implementation.md`.
4. Original context: `C:\Users\rjsc\Documents\Codex\2026-08-14\realtime-voice-chat-4\outputs\options-trade-analyzer-handoff.md`.
5. Durable local handoff: `docs/phase-1-handoff.md`.
6. Detailed SDD ledger: `.superpowers/sdd/2026-08-14-phase-1-entry-analyzer-implementation/progress.md`.
7. Task 10 review artifacts in that same SDD directory:
   - `task-10-report.md`
   - `task-10-review.md`
   - `task-10-fix-round-1-report.md`
   - `task-10-fix-round-1-rereview.md`

The approved design is authoritative if any handoff wording conflicts with it.

## Product constraints that must not change

- Options only. Users manually paste private Discord alerts.
- Advisory only. Never connect to a brokerage, auto-trade, or change positions.
- Verdicts are exactly `Consider`, `Wait`, and `Pass`.
- The percentage is setup evidence strength, never probability of profit.
- Do not score until ticker, call/put, strike, and expiration are confirmed.
- Zero- and one-DTE contracts require manually refreshed option premium and underlying price. Longer-dated analysis may use a timestamped delayed snapshot.
- Normal size is one or two contracts; three is the maximum.
- Risk uses only the options-trading budget: at or below 1% normal, above 1% through 2% caution, above 2% too aggressive. Very short-dated trades remain conservative.
- A 30% premium decline is a mandatory review alert, not an automatic exit.
- Keep trader source, host actions, app guidance, and user actions separate.
- Preserve mobile-first option-block styling, urgent Needs Attention ordering, and daily reconciliation as a documented boundary.
- A `Wait` verdict may be saved with unresolved confirmation conditions and manually refreshed with before/after evidence.
- Do not add Phase Two monitoring, automatic reevaluation, push notifications, continuous live data, brokerage integration, host follow-up tracking, analytics, or reconciliation automation.

## Completed and verified work

Tasks 1–9 are independently reviewed and complete. Task 10 implementation and its first review-fix round are committed:

```text
7d2839d test: verify phase one entry analyzer
08fabdd fix: resolve task 10 review findings
```

At `08fabdd`, fresh implementer verification was:

- Clean Supabase reset through migrations 0001–0003.
- pgTAP: 31/31.
- Vitest: 20 files, 157/157.
- Playwright: 12/12 across desktop Chromium and mobile WebKit.
- Dedicated axe journeys: 2/2, with zero serious/critical findings at the required checkpoints.
- ESLint, TypeScript, Next.js production build, and diff checks: exit 0.

Task 10 includes real passwordless authentication through local Supabase Mailpit, full desktop/mobile entry analysis, short-DTE safety gates, saved `Wait` refresh with before/after evidence, persisted purchase readback, accessibility checks, callback-origin hardening, documented dotenv loading, and operations documentation.

## The single open Task 10 finding

`task-10-fix-round-1-rereview.md` found one Important concurrency race:

- `commit_watch_candidate_decision` locks and resolves the candidate.
- The older `commit_wait_candidate_refresh` from migration 0002 checks `watching` without a row lock, performs snapshot/analysis writes, and later updates `latest_analysis_id` without rechecking eligibility.
- In two tabs, refresh can observe `watching`, pause, allow the terminal decision to resolve, then advance `latest_analysis_id` after resolution. The saved decision then references the former analysis instead of the candidate's final latest analysis.

The required invariant is: refresh and terminal decision serialize on the same candidate row. A losing refresh after resolution must roll back without orphan snapshot/analysis records; a stale terminal decision after a committed refresh must fail.

## Exact Task 10 fix round 2 recovery procedure

The prior implementer hit an account usage limit while stabilizing a real two-connection pgTAP/dblink regression. The intended behavioral RED was not captured before the uncommitted migration 0004 draft appeared.

Continue with strict red-green testing:

1. Inspect the two draft files and the rereview, then remove the uncommitted production migration `supabase/migrations/0004_candidate_refresh_lock.sql` before the RED run. Do not modify migrations 0001–0003.
2. Stabilize `supabase/tests/phase1_candidate_concurrency_test.sql`. It currently opens independent dblink sessions through `host.docker.internal port=54322 dbname=postgres user=postgres password=postgres` and exercises both orderings.
3. Reset the local database with migrations 0001–0003 only and run the concurrency test. Capture a failure caused by the race/invariant, not by dblink authentication, permissions, setup, or an incorrect test plan.
4. Recreate a fresh forward migration 0004. Redefine only `commit_wait_candidate_refresh` so it:
   - checks `auth.uid()` ownership;
   - selects the matching owner/alert-scoped `watching` candidate `FOR UPDATE` before snapshot or analysis writes;
   - uses the same candidate-first lock ordering as the terminal-decision RPC;
   - conditionally updates only the still-watching row whose latest analysis is the locked value;
   - verifies the update affected a row and raises to roll back all refresh writes otherwise;
   - preserves least-privilege function grants.
5. Run the two-connection test again and capture GREEN for both orderings, no orphan refresh data, and final decision/latest-analysis coherence.
6. Run a clean database reset applying migrations 0001–0004, all pgTAP files, the full application gates below, and a fresh scoped rereview.
7. Commit fix round 2 separately and write `.superpowers/sdd/2026-08-14-phase-1-entry-analyzer-implementation/task-10-fix-round-2-report.md` with exact RED/GREEN commands and output.

The current migration 0004 draft has the intended lock/check shape, but it is not accepted because its regression test did not first fail for the product race. Recreate it only after obtaining the valid RED.

## Verification commands

Use direct project executables. In this environment the managed `pnpm` wrapper can abort before dispatch with non-TTY/ignored-build policy errors.

If Docker is missing from `PATH`:

```powershell
$env:PATH = 'C:\Users\rjsc\AppData\Local\Programs\DockerDesktop\resources\bin;' + $env:PATH
```

Database:

```powershell
node_modules\.bin\supabase.cmd db reset
node_modules\.bin\supabase.cmd test db
```

Application:

```powershell
node_modules\.bin\vitest.cmd run
node_modules\.bin\playwright.cmd test
node_modules\.bin\playwright.cmd test --grep "logs in and completes"
node_modules\.bin\eslint.cmd .
node_modules\.bin\tsc.cmd --noEmit
```

Production build (use the local public anonymous key from `node_modules\.bin\supabase.cmd status -o env`):

```powershell
$env:NEXT_PUBLIC_SUPABASE_URL='http://127.0.0.1:54321'
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY='<local anonymous key>'
node_modules\.bin\next.cmd build
git diff -- next-env.d.ts
git diff --check
git status --short
```

Playwright uses port 3001 because port 3000 returned `EACCES` in this Windows environment. It uses real local Mailpit authentication and must not gain an auth bypass or service-role browser key.

## After Task 10 fix round 2 is clean

1. Generate a review package for the exact fix range and dispatch a fresh scoped rereviewer. Close all Critical/Important findings before accepting Task 10.
2. Update this file, `docs/phase-1-handoff.md`, and the SDD ledger with the commit and fresh controller evidence.
3. Perform the required broad whole-branch review from the Phase One implementation base through HEAD. Explicitly reconsider the ledgered deferred minors:
   - generated pnpm `unrs-resolver` build-approval placeholder;
   - Task 6 arrays/weights are compile-time readonly but not runtime-frozen;
   - Task 8 `PurchaseDecision` remains a large component.
4. Use one final fix dispatch and one scoped rereview if the whole-branch review finds issues.
5. Run the complete verification set again on the final tree.
6. Use the branch-finishing workflow and ask the user whether to merge locally, push/create a PR, or keep `phase-1-entry-analyzer` as-is. Do not merge or push without that decision.

## Repository hygiene

- Work in the current checkout; the user previously chose this location and branch.
- Preserve unrelated/user changes.
- Use `apply_patch` for file edits.
- Do not use `git reset --hard`, `git checkout --`, recursive cleanup, force push, or destructive worktree commands.
- Keep Playwright artifacts outside the repository at `%TEMP%\options-trade-analyzer-playwright`.
- The known Next 16 `middleware.ts` deprecation warning is non-blocking and intentionally deferred because the approved plan explicitly uses middleware.

