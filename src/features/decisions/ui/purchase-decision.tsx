"use client";

import { useState } from "react";
import type { EntryAnalysis } from "@/features/analysis/domain/analyzer";
import type { UnresolvedConfirmationCondition } from "@/features/decisions/domain/types";
import type { DecisionRepository } from "@/features/decisions/server/decision-repository";
import type {
  SavedWatchCandidate,
  WatchCandidateRepository,
} from "@/features/decisions/server/watch-candidate-repository";
import {
  WatchCandidateCard,
  type WatchCandidateCardProps,
} from "./watch-candidate-card";

type DecisionSelection = "purchased" | "skipped" | "saved_for_review" | "";

export interface PurchaseDecisionProps {
  analysis: EntryAnalysis;
  analysisId: string;
  sourceAnalyzedAt: string;
  userId: string;
  tradeAlertId: string;
  unresolvedConditions: UnresolvedConfirmationCondition[];
  decisionRepository: DecisionRepository;
  watchCandidateRepository: WatchCandidateRepository;
  onRefresh: WatchCandidateCardProps["onRefresh"];
  now?: () => Date;
}

export const PurchaseDecision = ({
  analysis,
  analysisId,
  sourceAnalyzedAt,
  userId,
  tradeAlertId,
  unresolvedConditions,
  decisionRepository,
  watchCandidateRepository,
  onRefresh,
  now = () => new Date(),
}: PurchaseDecisionProps) => {
  const [selection, setSelection] = useState<DecisionSelection>("");
  const [quantity, setQuantity] = useState("1");
  const [actualFill, setActualFill] = useState("");
  const [purchaseTimestamp, setPurchaseTimestamp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [candidate, setCandidate] = useState<SavedWatchCandidate | null>(null);
  const [saving, setSaving] = useState(false);

  const selectDecision = (value: DecisionSelection) => {
    setSelection(value);
    setError(null);
    setConfirmation(null);
  };

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setConfirmation(null);

    if (selection === "") {
      setError("Select a decision before saving.");
      return;
    }

    if (selection === "saved_for_review") {
      if (analysis.verdict !== "Wait") {
        setError("Saved for review is only available for a Wait analysis.");
        return;
      }

      setSaving(true);
      const result = await watchCandidateRepository.saveCandidate({
        userId,
        tradeAlertId,
        sourceAnalysisId: analysisId,
        sourceAnalysisVerdict: "Wait",
        latestAnalysisId: analysisId,
        unresolvedConfirmationConditions: structuredClone(unresolvedConditions),
      });
      setSaving(false);

      if (!result.ok) {
        setError(result.error.message);
        return;
      }

      setCandidate(result.value);
      setConfirmation("Saved for review.");
      return;
    }

    if (selection === "purchased") {
      const parsedFill = Number(actualFill);
      const parsedQuantity = Number(quantity);
      if (!Number.isFinite(parsedFill) || parsedFill <= 0) {
        setError("Actual fill must be a positive number.");
        return;
      }
      if (![1, 2, 3].includes(parsedQuantity)) {
        setError("Quantity must be one, two, or three.");
        return;
      }
      if (purchaseTimestamp.trim() === "") {
        setError("Actual purchase timestamp is required.");
        return;
      }
      if (!Number.isFinite(Date.parse(purchaseTimestamp))) {
        setError("Actual purchase timestamp must be a valid date and time.");
        return;
      }

      setSaving(true);
      const result = await decisionRepository.saveDecision({
        userId,
        tradeAlertId,
        entryAnalysisId: analysisId,
        decision: "purchased",
        quantity: parsedQuantity as 1 | 2 | 3,
        entryPremium: parsedFill,
        details: { modelVersion: analysis.modelVersion },
        decidedAt: purchaseTimestamp,
      });
      setSaving(false);

      if (!result.ok) {
        setError(result.error.message);
        return;
      }

      setConfirmation("Purchased decision saved.");
      return;
    }

    setSaving(true);
    const result = await decisionRepository.saveDecision({
      userId,
      tradeAlertId,
      entryAnalysisId: analysisId,
      decision: "skipped",
      quantity: null,
      entryPremium: null,
      details: { modelVersion: analysis.modelVersion },
      decidedAt: now().toISOString(),
    });
    setSaving(false);

    if (!result.ok) {
      setError(result.error.message);
      return;
    }

    setConfirmation("Skipped decision saved.");
  };

  return (
    <section aria-label="Purchase decision">
      <form onSubmit={save}>
        <fieldset>
          <legend>Record decision</legend>
          <label>
            <input
              type="radio"
              name="decision"
              value="purchased"
              checked={selection === "purchased"}
              onChange={() => selectDecision("purchased")}
            />
            Purchased
          </label>
          <label>
            <input
              type="radio"
              name="decision"
              value="skipped"
              checked={selection === "skipped"}
              onChange={() => selectDecision("skipped")}
            />
            Skipped
          </label>
          <label>
            <input
              type="radio"
              name="decision"
              value="saved_for_review"
              checked={selection === "saved_for_review"}
              disabled={analysis.verdict !== "Wait"}
              onChange={() => selectDecision("saved_for_review")}
            />
            Saved for review
          </label>
        </fieldset>

        {analysis.verdict === "Wait" ? null : (
          <p>Saved for review is only available for a Wait analysis.</p>
        )}

        {selection === "purchased" ? (
          <div>
            <label htmlFor="purchase-quantity">Quantity</label>
            <select
              id="purchase-quantity"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            >
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
            </select>
            <label htmlFor="actual-fill">Actual fill</label>
            <input
              id="actual-fill"
              type="number"
              step="any"
              value={actualFill}
              onChange={(event) => setActualFill(event.target.value)}
            />
            <label htmlFor="purchase-timestamp">Actual purchase timestamp</label>
            <input
              id="purchase-timestamp"
              type="text"
              value={purchaseTimestamp}
              onChange={(event) => setPurchaseTimestamp(event.target.value)}
              placeholder="2026-08-24T14:05:00.000Z"
            />
          </div>
        ) : null}

        {selection === "saved_for_review" ? (
          <div>
            <h3>Unresolved confirmation conditions</h3>
            <ul>
              {unresolvedConditions.map((condition) => (
                <li key={condition.id}>{condition.description}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <button type="submit" disabled={saving}>
          {saving ? "Saving decision…" : "Save decision"}
        </button>
        {error === null ? null : <p role="alert">{error}</p>}
        {confirmation === null ? null : <p role="status">{confirmation}</p>}
      </form>

      {candidate === null ? null : (
        <WatchCandidateCard
          candidate={candidate}
          sourceAnalysis={analysis}
          sourceAnalyzedAt={sourceAnalyzedAt}
          onRefresh={onRefresh}
        />
      )}
    </section>
  );
};
