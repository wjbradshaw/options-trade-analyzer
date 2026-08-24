# Options Trade Analyzer — Phase One Handoff

Last updated: 2026-08-24

## Purpose

This tracked file is the durable handoff for another developer or agent. Update it after every task, fix loop, verification change, blocker resolution, or scope ruling. The ignored SDD ledger at `.superpowers/sdd/2026-08-14-phase-1-entry-analyzer-implementation/progress.md` is the detailed execution record; this file is the concise, shareable resume point.

## Authoritative product sources

Read these before changing product behavior:

- Approved design: `C:\Users\rjsc\Documents\Codex\2026-08-14\realtime-voice-chat-4\docs\superpowers\specs\2026-08-14-options-trade-analyzer-design.md`
- Approved Phase One plan: `C:\Users\rjsc\Documents\Codex\2026-08-14\realtime-voice-chat-4\docs\superpowers\plans\2026-08-14-phase-1-entry-analyzer-implementation.md`
- Original product context: `C:\Users\rjsc\Documents\Codex\2026-08-14\realtime-voice-chat-4\outputs\options-trade-analyzer-handoff.md`
- Local traceability note: `docs/source-traceability.md`

The approved specification resolves any conflict with the plan or this handoff.

## Repository state

- Workspace: `C:\Users\rjsc\Documents\Codex\2026-08-17\options-trade-analyzer`
- Branch: `phase-1-entry-analyzer`
- Current implementation head: `0201d46 fix: enforce phase one persistence integrity`
- No remote push, merge, or deployment has been performed.

## Phase One constraints that must remain intact

- Options only; manual paste of private alerts only; advisory-only—never connect to a brokerage or execute a trade.
- Require confirmed ticker, call/put, strike, and expiration before scoring.
- Verdicts are exactly `Consider`, `Wait`, or `Pass`; the percentage is evidence strength, not probability of profit.
- Use only the user’s options-trading budget. One or two contracts are normal; three is the maximum. Risk tiers are ≤1% normal, >1–2% caution, and >2% `Too aggressive`.
- Zero- or one-DTE analysis requires manually refreshed premium and underlying price; full premium controls risk.
- A 30% premium decline is an advisory review trigger, never an automatic exit.
- Preserve raw alert text and corrected structured values.
- A `Wait` candidate may be saved with unresolved conditions and manually refreshed with before/after evidence. Do not add automatic re-evaluation, browser push, monitoring, host follow-ups, reconciliation, analytics, brokerage integration, or continuous live data in Phase One.

## Completed work

| Task | Status | Commits |
| --- | --- | --- |
| 1. Foundation and quality gates | Reviewed complete | `4c5cf47` through `2b45a23` |
| 2. Alert parser and critical-field validation | Reviewed complete | `277ca07`, `d3ff9f0` |
| 3. Calculations and risk rules | Reviewed complete | `7a26215` |
| 4. Supabase schema, auth, repositories | Code/review complete; live verification blocked | `7971005`, `0201d46` |

Task 4 includes a passwordless Supabase login/callback, typed client/server repositories, a Phase One migration with RLS and tenant-safe foreign keys, confirmed-contract enforcement before persisted analyses, and `Wait` candidate integrity. Its review/fix loop closed with no open code findings.

## Fresh verification evidence

At Task 4 head (`0201d46`), the controller ran successfully:

```powershell
node_modules/.bin/vitest.cmd run                 # 9 files, 47 tests passed
node_modules/.bin/eslint.cmd .                   # exit 0
node_modules/.bin/tsc.cmd --noEmit               # exit 0
$env:NEXT_PUBLIC_SUPABASE_URL='http://127.0.0.1:54321'
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY='test-anon-key'
node_modules/.bin/next.cmd build                 # exit 0
git diff --check 7a26215..HEAD                   # exit 0
```

The build emits the known Next 16 warning that `middleware.ts` is deprecated in favor of `proxy.ts`. Keep `middleware.ts` for now because the approved Task 4 plan explicitly requires it; do not migrate without a plan update.

Use direct project executables, not the managed `pnpm` wrapper: in this desktop environment `pnpm` aborts before running project scripts with `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`.

## Current blocker — resolve before Task 5

Task 4’s required live migration/RLS check has not run. The first Supabase CLI attempt was sandbox-blocked from creating `C:\Users\rjsc\.supabase`; an elevated retry reached startup and failed with:

```text
LegacyDockerLifecycleInspectError: docker: command not found (podman also not found)
```

Docker Desktop or Podman must be installed, running, and available on `PATH`. Then run:

```powershell
node_modules/.bin/supabase.cmd start
node_modules/.bin/supabase.cmd db reset
```

Verify the migration applies and that unauthenticated reads fail, while authenticated user A cannot read or cross-link user B’s records. Do not treat static migration tests as a substitute. Record the outcome in both this file and the SDD ledger before starting Task 5.

## Next implementation step

After resolving the live Supabase blocker, start **Task 5: Manual market snapshot and freshness policy** from the approved plan. Follow the existing workflow: test-first implementation, commit, independent task review, fix loop if needed, fresh verification, then update this handoff and the SDD ledger.

## Known non-blocking follow-ups

- `pnpm-workspace.yaml` retains pnpm’s generated `unrs-resolver` build-approval placeholder; it has no product behavior impact.
- Replace `src/lib/supabase/database.types.ts` with generated Supabase types once a database environment is available, after comparing generated and hand-maintained shapes.
