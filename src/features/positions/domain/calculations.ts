import type { UserPosition, UserPositionEvent } from "./types";

export interface PositionMetrics {
  totalInitialCost: number;
  realizedPnl: number;
  capitalRecovered: number;
  capitalRecoveredPercentage: number;
  unrealizedRunnerPnl: number;
  totalPnl: number;
  totalReturnPercentage: number;
  currentGainPercentage: number;
  isRunner: boolean;
  movementSinceFirstTrimPercentage: number | null;
}

export type MilestoneSeverity = "urgent" | "review" | "info";

export interface PositionMilestoneAlert {
  milestone: "loss_review" | "profit_review" | "cost_recovery";
  severity: MilestoneSeverity;
  headline: string;
  description: string;
  currentGainPercentage: number;
}

export interface MilestoneContext {
  thesisIntact: boolean;
  invalidationBreached: boolean;
}

export const roundToTwoDecimals = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

export const calculatePositionMetrics = (
  position: UserPosition,
  events: UserPositionEvent[],
  currentOptionPrice: number,
): PositionMetrics => {
  const totalInitialCost = roundToTwoDecimals(
    position.initialQuantity * position.initialEntryPremium * 100,
  );

  let realizedPnl = 0;
  let capitalRecovered = 0;
  let firstTrimPrice: number | null = null;

  for (const event of events) {
    if (
      (event.eventType === "trim" || event.eventType === "close") &&
      event.quantityDelta !== null &&
      event.executedPremium !== null
    ) {
      const quantityTrimmed = Math.abs(event.quantityDelta);
      const saleProceeds = quantityTrimmed * event.executedPremium * 100;
      const initialCostBasis = quantityTrimmed * position.initialEntryPremium * 100;

      capitalRecovered += saleProceeds;
      realizedPnl += saleProceeds - initialCostBasis;

      if (firstTrimPrice === null && event.eventType === "trim") {
        firstTrimPrice = event.executedPremium;
      }
    }
  }

  realizedPnl = roundToTwoDecimals(realizedPnl);
  capitalRecovered = roundToTwoDecimals(capitalRecovered);

  const capitalRecoveredPercentage = totalInitialCost > 0
    ? roundToTwoDecimals((capitalRecovered / totalInitialCost) * 100)
    : 0;

  const unrealizedRunnerPnl = position.remainingQuantity > 0
    ? roundToTwoDecimals(
        position.remainingQuantity *
          (currentOptionPrice - position.initialEntryPremium) *
          100,
      )
    : 0;

  const totalPnl = roundToTwoDecimals(realizedPnl + unrealizedRunnerPnl);
  const totalReturnPercentage = totalInitialCost > 0
    ? roundToTwoDecimals((totalPnl / totalInitialCost) * 100)
    : 0;

  const currentGainPercentage = position.initialEntryPremium > 0
    ? roundToTwoDecimals(
        ((currentOptionPrice - position.initialEntryPremium) /
          position.initialEntryPremium) *
          100,
      )
    : 0;

  const isRunner =
    position.status === "open" &&
    position.remainingQuantity < position.initialQuantity &&
    position.remainingQuantity > 0;

  const movementSinceFirstTrimPercentage =
    firstTrimPrice !== null && firstTrimPrice > 0
      ? roundToTwoDecimals(
          ((currentOptionPrice - firstTrimPrice) / firstTrimPrice) * 100,
        )
      : null;

  return {
    totalInitialCost,
    realizedPnl,
    capitalRecovered,
    capitalRecoveredPercentage,
    unrealizedRunnerPnl,
    totalPnl,
    totalReturnPercentage,
    currentGainPercentage,
    isRunner,
    movementSinceFirstTrimPercentage,
  };
};

export const evaluatePositionMilestones = (
  position: UserPosition,
  currentOptionPrice: number,
  context: MilestoneContext,
): PositionMilestoneAlert | null => {
  const gainPercentage =
    ((currentOptionPrice - position.initialEntryPremium) /
      position.initialEntryPremium) *
    100;

  // 1. Loss review check (decline >= 30%)
  if (gainPercentage <= -30) {
    const isUrgent = context.invalidationBreached || !context.thesisIntact;
    return {
      milestone: "loss_review",
      severity: isUrgent ? "urgent" : "review",
      headline: isUrgent
        ? "Urgent exit risk"
        : "Mandatory loss review (30% decline)",
      description: isUrgent
        ? "Position is down 30%+ and technical invalidation has been breached or thesis is broken. Strong advisory to exit."
        : "Option premium declined 30% from entry fill. Reassess underlying thesis, technical levels, and time decay without automatic closure.",
      currentGainPercentage: roundToTwoDecimals(gainPercentage),
    };
  }

  // 2. Cost-recovery opportunity (gain >= 100%)
  if (gainPercentage >= 100) {
    return {
      milestone: "cost_recovery",
      severity: "review",
      headline: "Cost-recovery opportunity (100% gain)",
      description:
        position.initialQuantity >= 2
          ? "Option premium reached 100%+ gain (2x entry). Selling 1 contract fully recovers initial premium, creating a realized-cost-free runner."
          : "Option premium reached 100%+ gain (2x entry). Re-evaluate thesis to take profit or trail invalidation.",
      currentGainPercentage: roundToTwoDecimals(gainPercentage),
    };
  }

  // 3. Profit review milestone (50% <= gain < 100%)
  if (gainPercentage >= 50) {
    return {
      milestone: "profit_review",
      severity: "review",
      headline: "50% profit review",
      description:
        position.initialQuantity >= 2
          ? "Option premium reached 50%+ gain. Trimming 1 contract now recovers ~75% of initial cost basis."
          : "Option premium reached 50%+ gain. Review evidence and consider taking profit or setting tighter stop levels.",
      currentGainPercentage: roundToTwoDecimals(gainPercentage),
    };
  }

  return null;
};
