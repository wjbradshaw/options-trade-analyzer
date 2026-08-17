# Task 3 report: calculations and personal risk rules

## Status

Completed. The implementation adds option break-even, DTE, and full-premium-loss calculations, plus a risk assessment based only on the supplied options budget. Risk tiers are normal at or below 1%, caution above 1% through 2%, and too aggressive above 2%. Zero- and one-DTE positions use full premium as controlling loss; longer-dated positions retain planned and maximum loss separately. Quantity one or two is normal, three is the maximum, and a quantity above three is rejected.

## TDD evidence

The new focused tests were run before the production modules existed and failed with module-not-found errors for the requested calculation and risk modules. After implementation, the focused suite passed.

## Verification

- `node_modules/.bin/vitest.cmd run tests/unit/calculations.test.ts tests/unit/risk.test.ts` — 2 files, 11 tests passed.
- `node_modules/.bin/eslint.cmd .` — passed.
- `node_modules/.bin/tsc.cmd --noEmit` — passed.

## Concerns

None. The risk calculation intentionally accepts an options-only `budget` value and has no brokerage-balance input.
