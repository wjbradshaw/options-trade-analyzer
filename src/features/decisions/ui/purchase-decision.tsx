"use client";

import { useId, useRef, useState } from "react";
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
import type { Result } from "@/lib/result";
import type { RepositoryError } from "@/lib/supabase/repository-error";

type DecisionSelection = "purchased" | "skipped" | "saved_for_review" | "";

const explicitIsoTimestamp =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

export interface PurchaseDecisionProps {
  analysis: EntryAnalysis;
  analysisId: string;
  sourceAnalyzedAt: string;
  userId: string;
  tradeAlertId: string;
  unresolvedConditions: UnresolvedConfirmationCondition[];
  decisionRepository: DecisionRepository;
  watchCandidateRepository: WatchCandidateRepository;
  watchCandidateId?: string;
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
  watchCandidateId,
  onRefresh,
  now = () => new Date(),
}: PurchaseDecisionProps) => {
  const instanceId = useId();
  const decisionName = `${instanceId}-decision`;
  const quantityId = `${instanceId}-purchase-quantity`;
  const fillId = `${instanceId}-actual-fill`;
  const timestampId = `${instanceId}-purchase-timestamp`;
  const [selection, setSelection] = useState<DecisionSelection>("");
  const [quantity, setQuantity] = useState("1");
  const [actualFill, setActualFill] = useState("");
  const [purchaseTimestamp, setPurchaseTimestamp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [candidate, setCandidate] = useState<SavedWatchCandidate | null>(null);
  const [saving, setSaving] = useState(false);
  const [committed, setCommitted] = useState(false);
  const saveInFlight = useRef(false);

  const selectDecision = (value: DecisionSelection) => {
    setSelection(value);
    setError(null);
    setConfirmation(null);
  };

  const persistOnce = async <T,>(
    operation: () => Promise<Result<T, RepositoryError>>,
  ): Promise<T | null> => {
    saveInFlight.current = true;
    setSaving(true);
    const result = await operation();
    setSaving(false);

    if (!result.ok) {
      saveInFlight.current = false;
      setError(result.error.message);
      return null;
    }

    setCommitted(true);
    return result.value;
  };

  const saveTerminalDecision = (
    input: Parameters<DecisionRepository["saveDecision"]>[0],
  ) =>
    watchCandidateId === undefined
      ? decisionRepository.saveDecision(input)
      : decisionRepository.saveCandidateDecision({
          ...input,
          candidateId: watchCandidateId,
        });

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saveInFlight.current || committed) return;
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

      const savedCandidate = await persistOnce(() =>
        watchCandidateRepository.saveCandidate({
          userId,
          tradeAlertId,
          sourceAnalysisId: analysisId,
          sourceAnalysisVerdict: "Wait",
          latestAnalysisId: analysisId,
          unresolvedConfirmationConditions:
            structuredClone(unresolvedConditions),
        }),
      );
      if (savedCandidate === null) return;

      setCandidate(savedCandidate);
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
      if (
        !explicitIsoTimestamp.test(purchaseTimestamp) ||
        !Number.isFinite(Date.parse(purchaseTimestamp))
      ) {
        setError(
          "Actual purchase timestamp must be an ISO date-time with Z or a numeric UTC offset.",
        );
        return;
      }

      const savedDecision = await persistOnce(() =>
        saveTerminalDecision({
          userId,
          tradeAlertId,
          entryAnalysisId: analysisId,
          decision: "purchased",
          quantity: parsedQuantity as 1 | 2 | 3,
          entryPremium: parsedFill,
          details: { modelVersion: analysis.modelVersion },
          decidedAt: new Date(purchaseTimestamp).toISOString(),
        }),
      );
      if (savedDecision === null) return;

      setConfirmation("Purchased decision saved.");
      return;
    }

    const savedDecision = await persistOnce(() =>
      saveTerminalDecision({
        userId,
        tradeAlertId,
        entryAnalysisId: analysisId,
        decision: "skipped",
        quantity: null,
        entryPremium: null,
        details: { modelVersion: analysis.modelVersion },
        decidedAt: now().toISOString(),
      }),
    );
    if (savedDecision === null) return;

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
              name={decisionName}
              value="purchased"
              checked={selection === "purchased"}
              disabled={saving || committed}
              onChange={() => selectDecision("purchased")}
            />
            Purchased
          </label>
          <label>
            <input
              type="radio"
              name={decisionName}
              value="skipped"
              checked={selection === "skipped"}
              disabled={saving || committed}
              onChange={() => selectDecision("skipped")}
            />
            Skipped
          </label>
          <label>
            <input
              type="radio"
              name={decisionName}
              value="saved_for_review"
              checked={selection === "saved_for_review"}
              disabled={analysis.verdict !== "Wait" || saving || committed}
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
            <label htmlFor={quantityId}>Quantity</label>
            <select
              id={quantityId}
              value={quantity}
              disabled={saving || committed}
              onChange={(event) => setQuantity(event.target.value)}
            >
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
            </select>
            <label htmlFor={fillId}>Actual fill</label>
            <input
              id={fillId}
              type="number"
              step="any"
              value={actualFill}
              disabled={saving || committed}
              onChange={(event) => setActualFill(event.target.value)}
            />
            <label htmlFor={timestampId}>Actual purchase timestamp</label>
            <input
              id={timestampId}
              type="text"
              value={purchaseTimestamp}
              disabled={saving || committed}
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

        <button type="submit" disabled={saving || committed}>
          {committed
            ? "Decision saved"
            : saving
              ? "Saving decision…"
              : "Save decision"}
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
