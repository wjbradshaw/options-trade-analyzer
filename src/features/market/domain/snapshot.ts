import { z } from "zod";

const positivePrice = z.number().finite().positive();

export const MarketSnapshotSchema = z.object({
  optionPremium: positivePrice.nullable(),
  underlyingPrice: positivePrice.nullable(),
  confirmedAt: z.iso.datetime(),
});

export type MarketSnapshot = z.infer<typeof MarketSnapshotSchema>;

export type FreshnessStatus = "blocked" | "fresh" | "delayed" | "stale";

export type RequiredSnapshotPrice = "optionPremium" | "underlyingPrice";

export type FreshnessEvaluation =
  | { status: "blocked"; missing: RequiredSnapshotPrice[] }
  | { status: Exclude<FreshnessStatus, "blocked"> };

export interface FreshnessInput extends MarketSnapshot {
  dte: number;
}

const freshAgeMilliseconds = 15 * 60 * 1000;
const delayedAgeMilliseconds = 24 * 60 * 60 * 1000;

const isPositivePrice = (value: number | null): boolean =>
  value !== null && Number.isFinite(value) && value > 0;

export const evaluateFreshness = (
  { dte, optionPremium, underlyingPrice, confirmedAt }: FreshnessInput,
  now: Date,
): FreshnessEvaluation => {
  if (dte === 0 || dte === 1) {
    const missing: RequiredSnapshotPrice[] = [];

    if (!isPositivePrice(optionPremium)) {
      missing.push("optionPremium");
    }

    if (!isPositivePrice(underlyingPrice)) {
      missing.push("underlyingPrice");
    }

    if (missing.length > 0) {
      return { status: "blocked", missing };
    }
  }

  const ageMilliseconds = now.getTime() - new Date(confirmedAt).getTime();

  if (ageMilliseconds <= freshAgeMilliseconds) {
    return { status: "fresh" };
  }

  if (ageMilliseconds <= delayedAgeMilliseconds) {
    return { status: "delayed" };
  }

  return { status: "stale" };
};
