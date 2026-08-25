"use client";

import { useState } from "react";
import type { EntryAnalysis } from "@/features/analysis/domain/analyzer";
import { factorLabels } from "@/features/analysis/ui/evidence-details";
import type { AnalysisFactorCategory } from "@/features/analysis/domain/factors";
import type { SavedWatchCandidate } from "@/features/decisions/server/watch-candidate-repository";
import type { Result } from "@/lib/result";
import type { RepositoryError } from "@/lib/supabase/repository-error";

export interface ChangedEvidence {
  category: AnalysisFactorCategory;
  before: string;
  after: string;
}

export interface WatchCandidateRefresh {
  candidate: SavedWatchCandidate;
  beforeAnalysis: EntryAnalysis;
  beforeAnalyzedAt: string;
  latestAnalysis: EntryAnalysis;
  latestAnalyzedAt: string;
  changedEvidence: ChangedEvidence[];
}

export interface WatchCandidateCardProps {
  candidate: SavedWatchCandidate;
  sourceAnalysis: EntryAnalysis;
  sourceAnalyzedAt: string;
  initialRefresh?: WatchCandidateRefresh;
  onRefresh: (
    candidate: SavedWatchCandidate,
  ) => Promise<Result<WatchCandidateRefresh, RepositoryError>>;
  onRefreshed?: (refresh: WatchCandidateRefresh) => void;
}

const WatchCandidateCardState = ({
  candidate,
  sourceAnalysis,
  sourceAnalyzedAt,
  initialRefresh,
  onRefresh,
  onRefreshed,
}: WatchCandidateCardProps) => {
  const [refresh, setRefresh] = useState<WatchCandidateRefresh | null>(
    initialRefresh ?? null,
  );
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refreshAnalysis = async () => {
    setRefreshing(true);
    setRefreshError(null);
    const result = await onRefresh(refresh?.candidate ?? candidate);
    setRefreshing(false);

    if (!result.ok) {
      setRefreshError(result.error.message);
      return;
    }

    setRefresh(result.value);
    onRefreshed?.(result.value);
  };

  return (
    <article aria-label="Saved review candidate">
      <h3>Saved for review</h3>
      <p>
        Original analysis: {sourceAnalysis.verdict} · {sourceAnalyzedAt}
      </p>
      <h4>Unresolved confirmation conditions</h4>
      <ul>
        {candidate.unresolvedConfirmationConditions.map((condition) => (
          <li key={condition.id}>{condition.description}</li>
        ))}
      </ul>
      <button type="button" onClick={refreshAnalysis} disabled={refreshing}>
        {refreshing ? "Refreshing analysis…" : "Refresh analysis"}
      </button>
      {refreshError === null ? null : <p role="alert">{refreshError}</p>}
      {refresh === null ? null : (
        <section aria-label="Analysis refresh result">
          {refresh.beforeAnalysis.verdict === "Wait" &&
          refresh.latestAnalysis.verdict === "Consider" ? (
            <p role="status">
              Review again - this setup moved from Wait to Consider
            </p>
          ) : null}
          <p>Before: {refresh.beforeAnalysis.verdict}</p>
          <p>After: {refresh.latestAnalysis.verdict}</p>
          <p>
            Before analysis: {refresh.beforeAnalysis.verdict} ·{" "}
            {refresh.beforeAnalyzedAt}
          </p>
          <p>
            Latest analysis: {refresh.latestAnalysis.verdict} ·{" "}
            {refresh.latestAnalyzedAt}
          </p>
          <h4>Changed evidence</h4>
          {refresh.changedEvidence.length === 0 ? (
            <p>No evidence changed.</p>
          ) : (
            <ul>
              {refresh.changedEvidence.map((change) => (
                <li key={change.category}>
                  <strong>{factorLabels[change.category]}</strong>
                  <div>Before evidence: {change.before}</div>
                  <div>After evidence: {change.after}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </article>
  );
};

export const WatchCandidateCard = (props: WatchCandidateCardProps) => (
  <WatchCandidateCardState key={props.candidate.id} {...props} />
);
