import { describe, expect, it } from "vitest";
import {
  createDailyReconciliation,
  toggleItemConfirmation,
} from "@/features/reconciliation/domain/reconciliation";

describe("Daily Reconciliation", () => {
  it("initializes daily reconciliation with unconfirmed items", () => {
    const state = createDailyReconciliation("2026-08-28", [
      {
        positionId: "pos-1",
        symbol: "SPX",
        strike: 6000,
        optionSide: "call",
        remainingQuantity: 2,
      },
    ]);

    expect(state.date).toBe("2026-08-28");
    expect(state.items).toHaveLength(1);
    expect(state.items[0].isConfirmed).toBe(false);
    expect(state.isFullyReconciled).toBe(false);
  });

  it("toggles item confirmation and updates isFullyReconciled status", () => {
    let state = createDailyReconciliation("2026-08-28", [
      {
        positionId: "pos-1",
        symbol: "SPX",
        strike: 6000,
        optionSide: "call",
        remainingQuantity: 2,
      },
      {
        positionId: "pos-2",
        symbol: "TSLA",
        strike: 250,
        optionSide: "put",
        remainingQuantity: 1,
      },
    ]);

    expect(state.isFullyReconciled).toBe(false);

    state = toggleItemConfirmation(state, "pos-1");
    expect(state.items[0].isConfirmed).toBe(true);
    expect(state.isFullyReconciled).toBe(false); // pos-2 still unconfirmed

    state = toggleItemConfirmation(state, "pos-2");
    expect(state.items[1].isConfirmed).toBe(true);
    expect(state.isFullyReconciled).toBe(true); // both confirmed
  });
});
