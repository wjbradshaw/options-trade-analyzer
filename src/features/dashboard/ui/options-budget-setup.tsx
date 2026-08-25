"use client";

import { useState } from "react";
import type { Profile, ProfileRepository } from "@/features/profile/server/profile-repository";

export interface OptionsBudgetSetupProps {
  userId: string;
  profileRepository: ProfileRepository;
  onSaved(profile: Profile): void;
}

export const OptionsBudgetSetup = ({
  userId,
  profileRepository,
  onSaved,
}: OptionsBudgetSetupProps) => {
  const [budget, setBudget] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const optionsBudget = Number(budget);
    if (!Number.isFinite(optionsBudget) || optionsBudget <= 0) {
      setError("Options-only trading budget must be a positive number.");
      return;
    }

    setSaving(true);
    setError(null);
    const result = await profileRepository.upsertProfile({ userId, optionsBudget });
    setSaving(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    onSaved(result.value);
  };

  return (
    <section aria-label="Options budget setup" style={{ maxWidth: "32rem" }}>
      <p style={{ color: "var(--accent)", fontWeight: 700 }}>Phase One setup</p>
      <h1>Set your options budget</h1>
      <p style={{ color: "var(--muted)", lineHeight: 1.6 }}>
        This options-only budget powers advisory risk checks. It does not request your full
        brokerage balance and never connects to a brokerage.
      </p>
      <form onSubmit={save} style={{ display: "grid", gap: "0.75rem" }}>
        <label htmlFor="options-budget">Options-only trading budget</label>
        <input
          id="options-budget"
          min="0.01"
          step="0.01"
          type="number"
          value={budget}
          onChange={(event) => setBudget(event.target.value)}
        />
        <button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save options budget"}
        </button>
        {error === null ? null : <p role="alert">{error}</p>}
      </form>
    </section>
  );
};
