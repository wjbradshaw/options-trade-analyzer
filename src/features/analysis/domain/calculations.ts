import type { OptionSide } from "@/features/alerts/domain/types";

const contractMultiplier = 100;
const centsPerDollar = 100;

export interface BreakEvenInput {
  side: OptionSide;
  strike: number;
  premium: number;
}

export interface DteInput {
  asOf: string;
  expiration: string;
}

export interface MaxPremiumLossInput {
  premium: number;
  quantity: number;
}

const toCents = (value: number): number => Math.round(value * centsPerDollar);

const toDollars = (cents: number): number => cents / centsPerDollar;

const requireFiniteNumber = (value: number, label: string): void => {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be a finite number`);
  }
};

const normalizeToUtcNoon = (value: string): number => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (match === null) {
    throw new RangeError("Dates must use YYYY-MM-DD format");
  }

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const normalized = Date.UTC(year, month - 1, day, 12);
  const date = new Date(normalized);

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new RangeError("Dates must be valid calendar dates");
  }

  return normalized;
};

export const calculateBreakEven = ({
  side,
  strike,
  premium,
}: BreakEvenInput): number => {
  requireFiniteNumber(strike, "Strike");
  requireFiniteNumber(premium, "Premium");

  const breakEvenCents =
    side === "call"
      ? toCents(strike) + toCents(premium)
      : toCents(strike) - toCents(premium);

  return toDollars(breakEvenCents);
};

export const calculateDte = ({ asOf, expiration }: DteInput): number =>
  (normalizeToUtcNoon(expiration) - normalizeToUtcNoon(asOf)) /
  (24 * 60 * 60 * 1000);

export const calculateMaxPremiumLoss = ({
  premium,
  quantity,
}: MaxPremiumLossInput): number => {
  requireFiniteNumber(premium, "Premium");

  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new RangeError("Quantity must be a positive whole number");
  }

  return toDollars(toCents(premium) * quantity * contractMultiplier);
};
