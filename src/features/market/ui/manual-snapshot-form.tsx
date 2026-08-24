"use client";

import { useState } from "react";
import {
  MarketSnapshotSchema,
  evaluateFreshness,
  type MarketSnapshot,
} from "@/features/market/domain/snapshot";

export interface ManualSnapshotFormProps {
  dte: number;
  now?: () => Date;
  onConfirm: (snapshot: MarketSnapshot) => void;
}

const parseOptionalPrice = (value: string): number | null =>
  value === "" ? null : Number(value);

export const ManualSnapshotForm = ({
  dte,
  now = () => new Date(),
  onConfirm,
}: ManualSnapshotFormProps) => {
  const [optionPremium, setOptionPremium] = useState("");
  const [underlyingPrice, setUnderlyingPrice] = useState("");
  const [confirmation, setConfirmation] = useState<MarketSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const confirmedAt = now().toISOString();
    const parsed = MarketSnapshotSchema.safeParse({
      optionPremium: parseOptionalPrice(optionPremium),
      underlyingPrice: parseOptionalPrice(underlyingPrice),
      confirmedAt,
    });

    if (!parsed.success) {
      setError("Enter positive values for each supplied user-entered price.");
      setConfirmation(null);
      return;
    }

    setError(null);
    setConfirmation(parsed.data);
    onConfirm(parsed.data);
  };

  const freshness =
    confirmation === null ? null : evaluateFreshness({ ...confirmation, dte }, now());

  return (
    <form onSubmit={submit}>
      <div>
        <label htmlFor="option-premium">User-entered option premium</label>
        <input
          id="option-premium"
          name="optionPremium"
          type="number"
          min="0"
          step="any"
          value={optionPremium}
          onChange={(event) => setOptionPremium(event.target.value)}
        />
      </div>
      <div>
        <label htmlFor="underlying-price">User-entered underlying price</label>
        <input
          id="underlying-price"
          name="underlyingPrice"
          type="number"
          min="0"
          step="any"
          value={underlyingPrice}
          onChange={(event) => setUnderlyingPrice(event.target.value)}
        />
      </div>
      <button type="submit">Confirm market snapshot</button>
      {error === null ? null : <p role="alert">{error}</p>}
      {confirmation === null ? null : (
        <p role="status">
          Confirmed at: {confirmation.confirmedAt}. Freshness: {freshness?.status}.
        </p>
      )}
    </form>
  );
};
