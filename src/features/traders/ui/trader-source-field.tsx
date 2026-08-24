"use client";

import { useEffect, useState } from "react";
import type { TraderRepository, TraderSource } from "@/features/traders/server/trader-repository";

export interface TraderSourceFieldProps {
  repository: TraderRepository;
  userId: string;
  selectedSource: TraderSource | null;
  onChange: (source: TraderSource | null) => void;
}

export const TraderSourceField = ({
  repository,
  userId,
  selectedSource,
  onChange,
}: TraderSourceFieldProps) => {
  const [sources, setSources] = useState<TraderSource[]>([]);
  const [newSourceName, setNewSourceName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    let current = true;

    const loadSources = async () => {
      const result = await repository.listTraderSources();
      if (!current) return;

      if (!result.ok) {
        setError(result.error.message);
        return;
      }

      setSources(result.value);
    };

    void loadSources();
    return () => {
      current = false;
    };
  }, [repository]);

  const createSource = async () => {
    const name = newSourceName.trim();
    if (name === "") {
      setError("New trader source is required.");
      return;
    }

    setIsCreating(true);
    setError(null);
    const result = await repository.createTraderSource({ userId, name });
    setIsCreating(false);

    if (!result.ok) {
      setError(result.error.message);
      return;
    }

    setSources((current) =>
      current.some((source) => source.id === result.value.id)
        ? current
        : [...current, result.value],
    );
    setNewSourceName("");
    onChange(result.value);
  };

  return (
    <section aria-label="Trader source" style={{ display: "grid", gap: "0.75rem" }}>
      <div>
        <label htmlFor="trader-source">Trader source</label>
        <select
          id="trader-source"
          name="traderSource"
          value={selectedSource?.id ?? ""}
          onChange={(event) =>
            onChange(sources.find((source) => source.id === event.target.value) ?? null)
          }
        >
          <option value="">Select trader source</option>
          {sources.map((source) => (
            <option key={source.id} value={source.id}>
              {source.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="new-trader-source">New trader source</label>
        <input
          id="new-trader-source"
          name="newTraderSource"
          value={newSourceName}
          onChange={(event) => setNewSourceName(event.target.value)}
        />
        <button type="button" onClick={() => void createSource()} disabled={isCreating}>
          Add trader source
        </button>
      </div>
      {error === null ? null : <p role="alert">{error}</p>}
    </section>
  );
};
