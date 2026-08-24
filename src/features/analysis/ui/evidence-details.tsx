import type {
  AnalysisFactor,
  AnalysisFactorCategory,
} from "@/features/analysis/domain/factors";

export const factorLabels: Record<AnalysisFactorCategory, string> = {
  contractCompleteness: "Contract completeness",
  timeRisk: "Time risk",
  personalRiskFit: "Personal risk fit",
  catalyst: "Catalyst",
  technicalAlignment: "Technical alignment",
  volatility: "Volatility",
  liquidity: "Liquidity",
  thesisQuality: "Thesis quality",
};

export interface EvidenceDetailsProps {
  factors: AnalysisFactor[];
}

export const EvidenceDetails = ({ factors }: EvidenceDetailsProps) => (
  <details>
    <summary>Source and timestamp details</summary>
    <ul>
      {factors.map((factor) => (
        <li key={factor.category}>
          {factorLabels[factor.category]}: {factor.source ?? "Source unavailable"} ·{" "}
          {factor.capturedAt ??
            (factor.source === null ? "Timestamp unavailable" : "Not timestamped")}
        </li>
      ))}
    </ul>
  </details>
);
