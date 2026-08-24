import type { OptionSide } from "@/features/alerts/domain/types";
import type { EntryAnalysis } from "@/features/analysis/domain/analyzer";
import {
  calculateBreakEven,
  calculateMaxPremiumLoss,
} from "@/features/analysis/domain/calculations";
import type { AnalysisFactor } from "@/features/analysis/domain/factors";
import { EvidenceDetails, factorLabels } from "./evidence-details";

export interface AnalysisContractSummary {
  symbol: string;
  side: OptionSide;
  strike: number;
  expiration: string;
  dte: number;
  optionPremium: number;
  quantity?: 1 | 2 | 3;
}

export interface HybridAnalysisBlockProps {
  analysis: EntryAnalysis;
  contract: AnalysisContractSummary;
}

const verdictColors: Record<EntryAnalysis["verdict"], string> = {
  Consider: "#2f9e44",
  Wait: "#b7791f",
  Pass: "#c92a2a",
};

const statusLabels: Record<AnalysisFactor["status"], string> = {
  supported: "Supported",
  limited: "Limited",
  unverified: "Unverified",
};

const formatUsd = (amount: number): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);

const EvidenceGroup = ({
  heading,
  factors,
}: {
  heading: string;
  factors: AnalysisFactor[];
}) => (
  <section>
    <h3>{heading}</h3>
    {factors.length === 0 ? (
      <p>None.</p>
    ) : (
      <ul>
        {factors.map((factor) => (
          <li key={factor.category}>
            <strong>{factorLabels[factor.category]}:</strong>{" "}
            {statusLabels[factor.status]} — {factor.summary}
          </li>
        ))}
      </ul>
    )}
  </section>
);

export const HybridAnalysisBlock = ({
  analysis,
  contract,
}: HybridAnalysisBlockProps) => {
  const breakEven = calculateBreakEven({
    side: contract.side,
    strike: contract.strike,
    premium: contract.optionPremium,
  });
  const maximumLoss = calculateMaxPremiumLoss({
    premium: contract.optionPremium,
    quantity: contract.quantity ?? 1,
  });
  const catalyst = analysis.factors.find((factor) => factor.category === "catalyst");
  const supportingFactors = analysis.factors.filter(
    (factor) => factor.status === "supported",
  );
  const blockingFactors = analysis.factors.filter(
    (factor) => factor.status !== "supported",
  );

  return (
    <section
      aria-label="Entry analysis"
      style={{ display: "grid", gap: "1rem", maxWidth: "100%" }}
    >
      <header>
        <p style={{ color: verdictColors[analysis.verdict], margin: 0 }}>
          <strong>{analysis.verdict}</strong>
        </p>
        <h2 style={{ marginBlock: "0.25rem" }}>{analysis.score}% setup evidence strength</h2>
        <p>Setup score measures evidence strength, not probability of profit.</p>
      </header>

      <dl
        style={{
          display: "grid",
          gap: "0.75rem",
          gridTemplateColumns: "repeat(auto-fit, minmax(10rem, 1fr))",
          margin: 0,
        }}
      >
        <div>
          <dt>Contract</dt>
          <dd style={{ margin: 0 }}>
            {contract.symbol} ${contract.strike} {contract.side} · expires{" "}
            {contract.expiration}
          </dd>
        </div>
        <div>
          <dt>DTE</dt>
          <dd style={{ margin: 0 }}>{contract.dte} days</dd>
        </div>
        <div>
          <dt>Break-even</dt>
          <dd style={{ margin: 0 }}>{formatUsd(breakEven)}</dd>
        </div>
        <div>
          <dt>Maximum loss</dt>
          <dd style={{ margin: 0 }}>{formatUsd(maximumLoss)}</dd>
        </div>
        <div>
          <dt>Catalyst</dt>
          <dd style={{ margin: 0 }}>{catalyst?.summary ?? "No catalyst confirmed."}</dd>
        </div>
      </dl>

      <EvidenceGroup heading="Supporting evidence" factors={supportingFactors} />
      <EvidenceGroup heading="Blocking evidence" factors={blockingFactors} />
      <EvidenceDetails factors={analysis.factors} />
    </section>
  );
};
