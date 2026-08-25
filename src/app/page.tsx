import { redirect } from "next/navigation";
import { SupabaseAnalysisRepository } from "@/features/analysis/server/analysis-repository";
import { entryAnalysisFromSaved } from "@/features/analysis/server/refresh-wait-candidate";
import { SupabaseAlertRepository } from "@/features/alerts/server/alert-repository";
import { SupabaseDecisionRepository } from "@/features/decisions/server/decision-repository";
import { SupabaseWatchCandidateRepository } from "@/features/decisions/server/watch-candidate-repository";
import { DashboardRoute } from "@/features/dashboard/ui/dashboard-route";
import type { HydratedWatchCandidate } from "@/features/dashboard/ui/dashboard-workflow";
import type { NeedsAttentionItem } from "@/features/dashboard/ui/needs-attention";
import { SupabaseProfileRepository } from "@/features/profile/server/profile-repository";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) redirect("/login");

  const profileRepository = new SupabaseProfileRepository(client);
  const analysisRepository = new SupabaseAnalysisRepository(client);
  const alertRepository = new SupabaseAlertRepository(client);
  const decisionRepository = new SupabaseDecisionRepository(client);
  const candidateRepository = new SupabaseWatchCandidateRepository(client);
  const [profileResult, latestResult, decisionsResult, candidatesResult] =
    await Promise.all([
      profileRepository.getProfile(),
      analysisRepository.getLatestAnalysis(),
      decisionRepository.listRecentDecisions(),
      candidateRepository.listWatchingCandidates(),
    ]);
  const attention: NeedsAttentionItem[] = [];

  if (!profileResult.ok && profileResult.error.code !== "not_found") {
    attention.push({
      id: "profile-load",
      severity: "blocking",
      message: profileResult.error.message,
    });
  }
  if (!latestResult.ok || !decisionsResult.ok || !candidatesResult.ok) {
    attention.push({
      id: "dashboard-history",
      severity: "urgent",
      message: "Some saved analysis history could not be loaded. Refresh before relying on prior records.",
    });
  }

  const hydratedCandidates: HydratedWatchCandidate[] = [];
  if (candidatesResult.ok) {
    const hydration = await Promise.all(
      candidatesResult.value.map(async (candidate) => {
        const [alert, source, latest] = await Promise.all([
          alertRepository.getAlert(candidate.tradeAlertId),
          analysisRepository.getAnalysis(candidate.sourceAnalysisId),
          analysisRepository.getAnalysis(candidate.latestAnalysisId),
        ]);
        if (!alert.ok || !source.ok || !latest.ok) return null;
        const sourceAnalysis = entryAnalysisFromSaved(source.value);
        const latestAnalysis = entryAnalysisFromSaved(latest.value);
        if (!sourceAnalysis || !latestAnalysis) return null;
        return {
          candidate,
          alert: alert.value,
          sourceAnalysis,
          sourceAnalyzedAt: source.value.analyzedAt,
          latestAnalysis,
          latestAnalyzedAt: latest.value.analyzedAt,
        } satisfies HydratedWatchCandidate;
      }),
    );
    hydratedCandidates.push(
      ...hydration.filter((candidate): candidate is HydratedWatchCandidate => candidate !== null),
    );
    if (hydratedCandidates.length !== candidatesResult.value.length) {
      attention.push({
        id: "candidate-hydration",
        severity: "urgent",
        message: "One or more saved Wait candidates could not be hydrated for review.",
      });
    }
  }

  return (
    <DashboardRoute
      userId={user.id}
      initialProfile={profileResult.ok ? profileResult.value : null}
      initialCandidates={hydratedCandidates}
      initialLatestAnalysis={latestResult.ok ? latestResult.value : null}
      initialRecentDecisions={decisionsResult.ok ? decisionsResult.value : []}
      initialAttention={attention}
    />
  );
}
