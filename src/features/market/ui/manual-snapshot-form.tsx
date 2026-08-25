"use client";

import { useState } from "react";
import {
  MarketSnapshotSchema,
  evaluateFreshness,
  type FreshnessEvaluation,
  type MarketSnapshot,
  type RequiredSnapshotPrice,
} from "@/features/market/domain/snapshot";

export interface ManualSnapshotFormProps {
  disabled?: boolean;
  dte: number;
  idPrefix?: string;
  now?: () => Date;
  onConfirm: (snapshot: MarketSnapshot) => void;
}

const parseOptionalPrice = (value: string): number | null =>
  value === "" ? null : Number(value);

const fieldLabels: Record<RequiredSnapshotPrice, string> = {
  optionPremium: "User-entered option premium",
  underlyingPrice: "user-entered underlying price",
};

const joinFieldLabels = (fields: RequiredSnapshotPrice[]): string =>
  fields.map((field) => fieldLabels[field]).join(" and ");

const invalidPriceMessage = (optionPremium: number | null, underlyingPrice: number | null): string => {
  const invalidFields = (Object.entries({ optionPremium, underlyingPrice }) as Array<
    [RequiredSnapshotPrice, number | null]
  >)
    .filter(([, value]) => value !== null && (!Number.isFinite(value) || value <= 0))
    .map(([field]) => field);

  const fields = joinFieldLabels(invalidFields);
  return invalidFields.length === 1
    ? `${fields} must be a positive number.`
    : `${fields} must be positive numbers.`;
};

export const ManualSnapshotForm = ({
  disabled = false,
  dte,
  idPrefix,
  now = () => new Date(),
  onConfirm,
}: ManualSnapshotFormProps) => {
  const optionPremiumId = idPrefix ? `${idPrefix}-option-premium` : "option-premium";
  const underlyingPriceId = idPrefix ? `${idPrefix}-underlying-price` : "underlying-price";
  const [optionPremium, setOptionPremium] = useState("");
  const [underlyingPrice, setUnderlyingPrice] = useState("");
  const [confirmation, setConfirmation] = useState<MarketSnapshot | null>(null);
  const [freshness, setFreshness] = useState<FreshnessEvaluation | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const evaluationNow = now();
    const parsedOptionPremium = parseOptionalPrice(optionPremium);
    const parsedUnderlyingPrice = parseOptionalPrice(underlyingPrice);
    const parsed = MarketSnapshotSchema.safeParse({
      optionPremium: parsedOptionPremium,
      underlyingPrice: parsedUnderlyingPrice,
      confirmedAt: evaluationNow.toISOString(),
    });

    if (!parsed.success) {
      setError(invalidPriceMessage(parsedOptionPremium, parsedUnderlyingPrice));
      setConfirmation(null);
      setFreshness(null);
      return;
    }

    const evaluation = evaluateFreshness({ ...parsed.data, dte }, evaluationNow);

    if (evaluation.status === "blocked") {
      setError(
        `${joinFieldLabels(evaluation.missing)} are required for zero- or one-DTE snapshots.`,
      );
      setConfirmation(null);
      setFreshness(null);
      return;
    }

    setError(null);
    setConfirmation(parsed.data);
    setFreshness(evaluation);
    onConfirm(parsed.data);
  };

  return (
    <form onSubmit={submit}>
      <div>
        <label htmlFor={optionPremiumId}>User-entered option premium</label>
        <input
          disabled={disabled}
          id={optionPremiumId}
          name="optionPremium"
          type="number"
          step="any"
          value={optionPremium}
          onChange={(event) => setOptionPremium(event.target.value)}
        />
      </div>
      <div>
        <label htmlFor={underlyingPriceId}>User-entered underlying price</label>
        <input
          disabled={disabled}
          id={underlyingPriceId}
          name="underlyingPrice"
          type="number"
          step="any"
          value={underlyingPrice}
          onChange={(event) => setUnderlyingPrice(event.target.value)}
        />
      </div>
      <button type="submit" disabled={disabled}>Confirm market snapshot</button>
      {error === null ? null : <p role="alert">{error}</p>}
      {confirmation === null ? null : (
        <p role="status">
          Confirmed at: {confirmation.confirmedAt}. Freshness: {freshness?.status}.
        </p>
      )}
    </form>
  );
};
