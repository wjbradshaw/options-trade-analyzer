import { describe, expect, it } from "vitest";
import {
  calculatePositionMetrics,
  evaluatePositionMilestones,
} from "@/features/positions/domain/calculations";
import type { UserPosition, UserPositionEvent } from "@/features/positions/domain/types";

const basePosition: UserPosition = {
  id: "pos-1",
  userId: "user-1",
  tradeAlertId: "alert-1",
  entryAnalysisId: "analysis-1",
  initialQuantity: 2,
  remainingQuantity: 2,
  initialEntryPremium: 2.0, // $200 per contract, total initial cost $400
  status: "open",
  openedAt: "2026-08-28T12:00:00.000Z",
  closedAt: null,
  createdAt: "2026-08-28T12:00:00.000Z",
  updatedAt: "2026-08-28T12:00:00.000Z",
};

describe("calculatePositionMetrics", () => {
  it("calculates metrics for an open 2-contract position before trims", () => {
    const metrics = calculatePositionMetrics(basePosition, [], 2.5); // +25%

    expect(metrics.totalInitialCost).toBe(400);
    expect(metrics.realizedPnl).toBe(0);
    expect(metrics.capitalRecovered).toBe(0);
    expect(metrics.capitalRecoveredPercentage).toBe(0);
    expect(metrics.unrealizedRunnerPnl).toBe(100); // 2 * (2.5 - 2.0) * 100
    expect(metrics.totalPnl).toBe(100);
    expect(metrics.totalReturnPercentage).toBe(25);
    expect(metrics.currentGainPercentage).toBe(25);
    expect(metrics.isRunner).toBe(false);
  });

  it("calculates metrics after trimming 1 contract at 50% gain ($3.00)", () => {
    const trimEvent: UserPositionEvent = {
      id: "evt-1",
      userPositionId: "pos-1",
      userId: "user-1",
      eventType: "trim",
      quantityDelta: -1,
      executedPremium: 3.0,
      notes: "Trim 1",
      eventPayload: {},
      createdAt: "2026-08-28T12:15:00.000Z",
    };

    const trimmedPosition: UserPosition = {
      ...basePosition,
      remainingQuantity: 1,
    };

    // Current price is now $4.00 (+100% from entry)
    const metrics = calculatePositionMetrics(trimmedPosition, [trimEvent], 4.0);

    expect(metrics.totalInitialCost).toBe(400);
    expect(metrics.realizedPnl).toBe(100); // (3.0 - 2.0) * 1 * 100
    expect(metrics.capitalRecovered).toBe(300); // 3.0 * 1 * 100
    expect(metrics.capitalRecoveredPercentage).toBe(75); // 300 / 400 = 75%
    expect(metrics.unrealizedRunnerPnl).toBe(200); // 1 * (4.0 - 2.0) * 100
    expect(metrics.totalPnl).toBe(300); // 100 realized + 200 unrealized
    expect(metrics.totalReturnPercentage).toBe(75); // 300 / 400 = 75%
    expect(metrics.isRunner).toBe(true);
    expect(metrics.movementSinceFirstTrimPercentage).toBe(33.33); // (4.0 - 3.0)/3.0 = +33.33%
  });

  it("calculates metrics for a fully closed position", () => {
    const events: UserPositionEvent[] = [
      {
        id: "evt-1",
        userPositionId: "pos-1",
        userId: "user-1",
        eventType: "trim",
        quantityDelta: -1,
        executedPremium: 4.0, // 100% gain ($400 recovered)
        notes: "Cost recovery trim",
        eventPayload: {},
        createdAt: "2026-08-28T12:15:00.000Z",
      },
      {
        id: "evt-2",
        userPositionId: "pos-1",
        userId: "user-1",
        eventType: "close",
        quantityDelta: -1,
        executedPremium: 6.0, // +200% gain ($600)
        notes: "Close runner",
        eventPayload: {},
        createdAt: "2026-08-28T12:30:00.000Z",
      },
    ];

    const closedPosition: UserPosition = {
      ...basePosition,
      remainingQuantity: 0,
      status: "closed",
    };

    const metrics = calculatePositionMetrics(closedPosition, events, 6.0);

    expect(metrics.realizedPnl).toBe(600); // (4-2)*100 + (6-2)*100 = 200 + 400 = 600
    expect(metrics.capitalRecovered).toBe(1000);
    expect(metrics.capitalRecoveredPercentage).toBe(250);
    expect(metrics.unrealizedRunnerPnl).toBe(0);
    expect(metrics.totalPnl).toBe(600);
    expect(metrics.totalReturnPercentage).toBe(150); // 600 / 400 = 150%
  });
});

describe("evaluatePositionMilestones", () => {
  it("triggers mandatory loss review when down 30%", () => {
    // Entry was 2.0, current price is 1.4 (-30%)
    const alert = evaluatePositionMilestones(basePosition, 1.4, {
      thesisIntact: true,
      invalidationBreached: false,
    });

    expect(alert).toMatchObject({
      milestone: "loss_review",
      severity: "review",
      headline: "Mandatory loss review (30% decline)",
    });
  });

  it("escalates to urgent exit risk when down 30% with thesis/invalidation failure", () => {
    const alert = evaluatePositionMilestones(basePosition, 1.3, {
      thesisIntact: false,
      invalidationBreached: true,
    });

    expect(alert).toMatchObject({
      milestone: "loss_review",
      severity: "urgent",
      headline: "Urgent exit risk",
    });
  });

  it("triggers profit review at 50% gain for 2-contract position", () => {
    // Entry was 2.0, current is 3.0 (+50%)
    const alert = evaluatePositionMilestones(basePosition, 3.0, {
      thesisIntact: true,
      invalidationBreached: false,
    });

    expect(alert).toMatchObject({
      milestone: "profit_review",
      severity: "review",
      headline: "50% profit review",
    });
  });

  it("triggers cost-recovery opportunity at 100% gain for 2-contract position", () => {
    // Entry was 2.0, current is 4.0 (+100%)
    const alert = evaluatePositionMilestones(basePosition, 4.0, {
      thesisIntact: true,
      invalidationBreached: false,
    });

    expect(alert).toMatchObject({
      milestone: "cost_recovery",
      severity: "review",
      headline: "Cost-recovery opportunity (100% gain)",
    });
  });

  it("returns null when within normal price bounds", () => {
    const alert = evaluatePositionMilestones(basePosition, 2.2, {
      thesisIntact: true,
      invalidationBreached: false,
    });

    expect(alert).toBeNull();
  });
});
