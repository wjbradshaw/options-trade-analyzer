"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { ParsedTradeAlert } from "@/features/alerts/domain/types";
import type { SavedAlert } from "@/features/alerts/server/alert-repository";
import { AlertPasteForm } from "@/features/alerts/ui/alert-paste-form";
import { calculateDte } from "@/features/analysis/domain/calculations";
import type { EntryAnalysis } from "@/features/analysis/domain/analyzer";
import type { SavedAnalysis } from "@/features/analysis/server/analysis-repository";
import type { RefreshWaitCandidateCommand } from "@/features/analysis/server/refresh-wait-candidate";
import {
  resolveAlertExpiration,
  type AnalyzeAlertCommand,
  type AnalyzeAlertError,
  type DashboardEntryAnalysis,
} from "@/features/analysis/server/analysis-workflow";
import { HybridAnalysisBlock } from "@/features/analysis/ui/hybrid-analysis-block";
import type {
  DecisionRepository,
  SavedDecision,
} from "@/features/decisions/server/decision-repository";
import type {
  SavedWatchCandidate,
  WatchCandidateRepository,
} from "@/features/decisions/server/watch-candidate-repository";
import { PurchaseDecision } from "@/features/decisions/ui/purchase-decision";
import { WatchCandidateCard } from "@/features/decisions/ui/watch-candidate-card";
import { ManualSnapshotForm } from "@/features/market/ui/manual-snapshot-form";
import type {
  Profile,
  ProfileRepository,
} from "@/features/profile/server/profile-repository";
import type {
  TraderRepository,
  TraderSource,
} from "@/features/traders/server/trader-repository";
import { err, type Result } from "@/lib/result";
import type { RepositoryError } from "@/lib/supabase/repository-error";
import type {
  ChangedEvidence,
  WatchCandidateRefresh,
} from "@/features/decisions/ui/watch-candidate-card";
import type { NeedsAttentionItem } from "./needs-attention";
import { Dashboard } from "./dashboard";
import { OptionsBudgetSetup } from "./options-budget-setup";

export interface HydratedWatchCandidate {
  candidate: SavedWatchCandidate;
  alert: SavedAlert;
  sourceAnalysis: EntryAnalysis;
  sourceAnalyzedAt: string;
  latestAnalysis: EntryAnalysis;
  latestAnalyzedAt: string;
}

export interface DashboardWorkflowProps {
  userId: string;
  initialProfile: Profile | null;
  profileLoadError?: string | null;
  initialCandidates: HydratedWatchCandidate[];
  initialLatestAnalysis: SavedAnalysis | null;
  initialRecentDecisions: SavedDecision[];
  initialAttention: NeedsAttentionItem[];
  profileRepository: ProfileRepository;
  traderRepository: TraderRepository;
  decisionRepository: DecisionRepository;
  watchCandidateRepository: WatchCandidateRepository;
  analyzeAction(
    command: AnalyzeAlertCommand,
  ): Promise<Result<DashboardEntryAnalysis, AnalyzeAlertError>>;
  refreshCandidateAction?: (
    command: RefreshWaitCandidateCommand,
  ) => Promise<Result<WatchCandidateRefresh, RepositoryError>>;
  now?: () => Date;
}

export interface SavedCandidateReviewProps {
  item: HydratedWatchCandidate;
  decisionRepository: DecisionRepository;
  watchCandidateRepository: WatchCandidateRepository;
  refreshAction(
    command: RefreshWaitCandidateCommand,
  ): Promise<Result<WatchCandidateRefresh, RepositoryError>>;
  now?: () => Date;
}

const compareEvidence = (
  before: EntryAnalysis,
  after: EntryAnalysis,
): ChangedEvidence[] =>
  after.factors.flatMap((latest) => {
    const previous = before.factors.find(
      (factor) => factor.category === latest.category,
    );
    if (
      previous &&
      previous.status === latest.status &&
      previous.summary === latest.summary
    ) {
      return [];
    }
    return [
      {
        category: latest.category,
        before: previous
          ? `${previous.status}: ${previous.summary}`
          : "Not previously recorded",
        after: `${latest.status}: ${latest.summary}`,
      },
    ];
  });

export const SavedCandidateReview = ({
  item,
  decisionRepository,
  watchCandidateRepository,
  refreshAction,
  now = () => new Date(),
}: SavedCandidateReviewProps) => {
  const [snapshot, setSnapshot] = useState<
    AnalyzeAlertCommand["marketSnapshot"] | null
  >(null);
  const [quantity, setQuantity] = useState<1 | 2 | 3>(1);
  const dte = calculateDte({
    asOf: now().toISOString().slice(0, 10),
    expiration: item.alert.expiration as string,
  });
  const initialRefresh: WatchCandidateRefresh | undefined =
    item.candidate.sourceAnalysisId === item.candidate.latestAnalysisId
      ? undefined
      : {
          candidate: item.candidate,
          beforeAnalysis: item.sourceAnalysis,
          beforeAnalyzedAt: item.sourceAnalyzedAt,
          latestAnalysis: item.latestAnalysis,
          latestAnalyzedAt: item.latestAnalyzedAt,
          changedEvidence: compareEvidence(
            item.sourceAnalysis,
            item.latestAnalysis,
          ),
        };
  const [latestRefresh, setLatestRefresh] =
    useState<WatchCandidateRefresh | null>(initialRefresh ?? null);

  return (
    <section aria-label={`Refresh ${item.alert.symbol ?? "saved candidate"}`}>
      <h3>New manual snapshot</h3>
      <label htmlFor={`refresh-quantity-${item.candidate.id}`}>
        Refresh quantity
      </label>
      <select
        id={`refresh-quantity-${item.candidate.id}`}
        value={quantity}
        onChange={(event) =>
          setQuantity(Number(event.target.value) as 1 | 2 | 3)
        }
      >
        <option value="1">1</option>
        <option value="2">2</option>
        <option value="3">3 (maximum)</option>
      </select>
      <ManualSnapshotForm
        idPrefix={`candidate-${item.candidate.id}`}
        dte={dte}
        now={now}
        onConfirm={setSnapshot}
      />
      {snapshot === null ? null : (
        <p role="status">New snapshot confirmed. Select Refresh analysis.</p>
      )}
      <WatchCandidateCard
        candidate={item.candidate}
        sourceAnalysis={item.sourceAnalysis}
        sourceAnalyzedAt={item.sourceAnalyzedAt}
        initialRefresh={initialRefresh}
        onRefreshed={setLatestRefresh}
        onRefresh={async () =>
          snapshot === null
            ? err({
                code: "database",
                message: "Confirm a new manual snapshot before refresh.",
              })
            : refreshAction({
                candidateId: item.candidate.id,
                marketSnapshot: snapshot,
                quantity,
              }).then((result) => {
                if (result.ok) setSnapshot(null);
                return result;
              })
        }
      />
      {latestRefresh === null ? null : (
        <PurchaseDecision
          analysis={latestRefresh.latestAnalysis}
          analysisId={latestRefresh.candidate.latestAnalysisId}
          sourceAnalyzedAt={latestRefresh.latestAnalyzedAt}
          userId={latestRefresh.candidate.userId}
          tradeAlertId={latestRefresh.candidate.tradeAlertId}
          unresolvedConditions={
            latestRefresh.candidate.unresolvedConfirmationConditions
          }
          decisionRepository={decisionRepository}
          watchCandidateRepository={watchCandidateRepository}
          watchCandidateId={latestRefresh.candidate.id}
          onRefresh={async () =>
            err({
              code: "database",
              message: "Confirm a new manual snapshot before another refresh.",
            })
          }
          now={now}
        />
      )}
    </section>
  );
};

const unresolvedConditions = (analysis: EntryAnalysis) =>
  analysis.factors
    .filter((factor) => factor.status !== "supported")
    .map((factor) => ({
      id: factor.category,
      category: factor.category,
      description: factor.summary,
    }));

export const DashboardWorkflow = ({
  userId,
  initialProfile,
  profileLoadError = null,
  initialCandidates,
  initialLatestAnalysis,
  initialRecentDecisions,
  initialAttention,
  profileRepository,
  traderRepository,
  decisionRepository,
  watchCandidateRepository,
  analyzeAction,
  refreshCandidateAction,
  now = () => new Date(),
}: DashboardWorkflowProps) => {
  const [profile, setProfile] = useState(initialProfile);
  const [pendingAlert, setPendingAlert] = useState<ParsedTradeAlert | null>(
    null,
  );
  const [traderSource, setTraderSource] = useState<TraderSource | null>(null);
  const [dte, setDte] = useState<number | null>(null);
  const [quantity, setQuantity] = useState<1 | 2 | 3>(1);
  const [plannedLoss, setPlannedLoss] = useState("");
  const [completed, setCompleted] = useState<DashboardEntryAnalysis | null>(
    null,
  );
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const analysisInFlight = useRef(false);

  if (profileLoadError !== null) {
    return (
      <main style={{ display: "grid", gap: "1rem", padding: "1rem" }}>
        <section
          aria-label="Profile load error"
          style={{
            background: "#2a1820",
            border: "1px solid #c56a7a",
            borderRadius: "0.75rem",
            maxWidth: "40rem",
            padding: "1rem",
          }}
        >
          <h1>Trading budget could not load</h1>
          <p role="alert">{profileLoadError}</p>
          <Link href="/">Retry profile load</Link>
        </section>
      </main>
    );
  }

  if (profile === null) {
    return (
      <Dashboard
        needsAttentionItems={initialAttention}
        budgetSetup={
          <OptionsBudgetSetup
            userId={userId}
            profileRepository={profileRepository}
            onSaved={setProfile}
          />
        }
        pasteFlow={null}
        savedCandidates={null}
        latestAnalysis={null}
        recentDecisions={null}
      />
    );
  }

  const selectAlert = (alert: ParsedTradeAlert, source: TraderSource) => {
    const canonicalExpiration = resolveAlertExpiration(
      alert.expiration as string,
      alert.submittedAt,
    );
    setPendingAlert(alert);
    setTraderSource(source);
    setDte(
      calculateDte({
        asOf: new Date(alert.submittedAt).toISOString().slice(0, 10),
        expiration: canonicalExpiration,
      }),
    );
    setCompleted(null);
    setAnalysisError(null);
  };

  const analyzeSnapshot = async (
    marketSnapshot: AnalyzeAlertCommand["marketSnapshot"],
  ) => {
    if (
      pendingAlert === null ||
      traderSource === null ||
      analysisInFlight.current
    )
      return;
    analysisInFlight.current = true;
    setAnalyzing(true);
    setAnalysisError(null);
    const parsedPlannedLoss =
      plannedLoss.trim() === "" ? undefined : Number(plannedLoss);
    try {
      const result = await analyzeAction({
        alert: pendingAlert,
        traderSourceId: traderSource.id,
        marketSnapshot,
        quantity,
        plannedLoss: parsedPlannedLoss,
      });
      if (!result.ok) {
        setAnalysisError(result.error.message);
        return;
      }
      setCompleted(result.value);
    } catch {
      setAnalysisError("The entry analysis could not be completed.");
    } finally {
      analysisInFlight.current = false;
      setAnalyzing(false);
    }
  };

  const attention = [
    ...initialAttention,
    ...(analysisError === null
      ? []
      : [
          {
            id: "analysis-error",
            severity: "blocking" as const,
            message: analysisError,
          },
        ]),
  ];
  const pasteFlow = (
    <section
      aria-label="Paste flow"
      style={{
        background: "var(--surface)",
        borderRadius: "0.75rem",
        padding: "1rem",
      }}
    >
      <h1>Analyze an options entry</h1>
      <p style={{ color: "var(--muted)" }}>
        Manually paste a private long call or put alert. Analysis is advisory
        only.
      </p>
      <AlertPasteForm
        traderRepository={traderRepository}
        userId={userId}
        submittedAt={() => now().toISOString()}
        onAnalyze={selectAlert}
      />
      {pendingAlert === null || dte === null ? null : (
        <section
          aria-label="Manual analysis inputs"
          style={{ marginTop: "1.5rem" }}
        >
          <h2>Confirm market snapshot</h2>
          <label htmlFor="planned-quantity">Planned quantity</label>
          <select
            disabled={analyzing}
            id="planned-quantity"
            value={quantity}
            onChange={(event) =>
              setQuantity(Number(event.target.value) as 1 | 2 | 3)
            }
          >
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3 (maximum)</option>
          </select>
          <label htmlFor="planned-loss">Planned loss (optional)</label>
          <input
            disabled={analyzing}
            id="planned-loss"
            min="0"
            step="0.01"
            type="number"
            value={plannedLoss}
            onChange={(event) => setPlannedLoss(event.target.value)}
          />
          <ManualSnapshotForm
            disabled={analyzing}
            dte={dte}
            now={now}
            onConfirm={(snapshot) => void analyzeSnapshot(snapshot)}
          />
          {analyzing ? <p role="status">Analyzing and saving…</p> : null}
        </section>
      )}
      {completed === null ? null : (
        <div style={{ display: "grid", gap: "1rem", marginTop: "1.5rem" }}>
          <HybridAnalysisBlock
            analysis={completed.analysis}
            contract={completed.contract}
          />
          <PurchaseDecision
            analysis={completed.analysis}
            analysisId={completed.analysisId}
            sourceAnalyzedAt={completed.analyzedAt}
            userId={userId}
            tradeAlertId={completed.alertId}
            unresolvedConditions={unresolvedConditions(completed.analysis)}
            decisionRepository={decisionRepository}
            watchCandidateRepository={watchCandidateRepository}
            onRefresh={async () =>
              err({
                code: "database",
                message:
                  "Confirm a new manual snapshot in Saved Wait candidates.",
              })
            }
            now={now}
          />
        </div>
      )}
    </section>
  );
  const savedCandidates = (
    <section
      aria-label="Saved Wait candidates"
      style={{
        background: "var(--surface)",
        borderRadius: "0.75rem",
        padding: "1rem",
      }}
    >
      <h2>Saved Wait candidates</h2>
      {initialCandidates.length === 0 ? (
        <p>No saved Wait candidates.</p>
      ) : (
        initialCandidates.map((item) => (
          <SavedCandidateReview
            key={item.candidate.id}
            item={item}
            decisionRepository={decisionRepository}
            watchCandidateRepository={watchCandidateRepository}
            refreshAction={
              refreshCandidateAction ??
              (async () =>
                err({
                  code: "database",
                  message: "Candidate refresh is unavailable.",
                }))
            }
            now={now}
          />
        ))
      )}
    </section>
  );
  const latestAnalysis = (
    <section
      aria-label="Latest completed analysis"
      style={{
        background: "var(--surface)",
        borderRadius: "0.75rem",
        padding: "1rem",
      }}
    >
      <h2>Latest completed analysis</h2>
      {completed ? (
        <p>
          {completed.analysis.verdict} · {completed.analysis.score}% evidence
          strength · {completed.analyzedAt}
        </p>
      ) : initialLatestAnalysis ? (
        <p>
          {initialLatestAnalysis.verdict} ·{" "}
          {initialLatestAnalysis.evidenceScore}% evidence strength ·{" "}
          {initialLatestAnalysis.analyzedAt}
        </p>
      ) : (
        <p>No completed analysis yet.</p>
      )}
    </section>
  );
  const recentDecisions = (
    <section
      aria-label="Recent decisions"
      style={{
        background: "var(--surface)",
        borderRadius: "0.75rem",
        padding: "1rem",
      }}
    >
      <h2>Recent decisions</h2>
      {initialRecentDecisions.length === 0 ? (
        <p>No recorded decisions yet.</p>
      ) : (
        <ul>
          {initialRecentDecisions.map((decision) => (
            <li key={decision.id}>
              {decision.decision} · {decision.decidedAt}
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  return (
    <Dashboard
      needsAttentionItems={attention}
      pasteFlow={pasteFlow}
      savedCandidates={savedCandidates}
      latestAnalysis={latestAnalysis}
      recentDecisions={recentDecisions}
    />
  );
};
