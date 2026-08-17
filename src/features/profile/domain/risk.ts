const centsPerDollar = 100;

export type RiskTier = "normal" | "caution" | "too_aggressive";

export type QuantityStatus = "not_provided" | "normal" | "maximum";

export interface RiskAssessmentInput {
  budget: number;
  maxLoss: number;
  plannedLoss?: number;
  dte: number;
  quantity?: number;
}

export interface RiskAssessment {
  plannedLoss: number;
  maximumLoss: number;
  controllingLoss: number;
  riskPercent: number;
  tier: RiskTier;
  quantityStatus: QuantityStatus;
}

const toCents = (value: number): number => Math.round(value * centsPerDollar);

const toDollars = (cents: number): number => cents / centsPerDollar;

const requireFiniteNumber = (value: number, label: string): void => {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be a finite number`);
  }
};

const classifyQuantity = (quantity: number | undefined): QuantityStatus => {
  if (quantity === undefined) {
    return "not_provided";
  }

  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new RangeError("Quantity must be a positive whole number");
  }

  if (quantity > 3) {
    throw new RangeError("Quantity cannot exceed three contracts");
  }

  return quantity === 3 ? "maximum" : "normal";
};

const calculateTier = (riskPercent: number): RiskTier => {
  if (riskPercent <= 1) {
    return "normal";
  }

  if (riskPercent <= 2) {
    return "caution";
  }

  return "too_aggressive";
};

export const calculateRiskAssessment = ({
  budget,
  maxLoss,
  plannedLoss = maxLoss,
  dte,
  quantity,
}: RiskAssessmentInput): RiskAssessment => {
  requireFiniteNumber(budget, "Options budget");
  requireFiniteNumber(maxLoss, "Maximum loss");
  requireFiniteNumber(plannedLoss, "Planned loss");

  if (budget <= 0) {
    throw new RangeError("Options budget must be greater than zero");
  }

  if (maxLoss < 0 || plannedLoss < 0) {
    throw new RangeError("Loss amounts cannot be negative");
  }

  const maximumLossCents = toCents(maxLoss);
  const plannedLossCents = toCents(plannedLoss);

  if (plannedLossCents > maximumLossCents) {
    throw new RangeError("Planned loss cannot exceed maximum loss");
  }

  const controllingLossCents = dte <= 1 ? maximumLossCents : plannedLossCents;
  const riskPercent = (controllingLossCents / toCents(budget)) * 100;

  return {
    plannedLoss: toDollars(plannedLossCents),
    maximumLoss: toDollars(maximumLossCents),
    controllingLoss: toDollars(controllingLossCents),
    riskPercent,
    tier: calculateTier(riskPercent),
    quantityStatus: classifyQuantity(quantity),
  };
};
