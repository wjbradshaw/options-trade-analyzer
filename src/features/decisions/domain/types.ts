import type { EntryVerdict } from "@/features/analysis/domain/analyzer";
import type { AnalysisFactorCategory } from "@/features/analysis/domain/factors";

export interface UnresolvedConfirmationCondition {
  id: string;
  category: AnalysisFactorCategory;
  description: string;
}

export type TradeDecision =
  | {
      state: "Purchased";
      quantity: 1 | 2 | 3;
      actualFill: number;
      decidedAt: string;
      modelVersion: "phase-1-v1";
    }
  | {
      state: "Skipped";
      decidedAt: string;
      modelVersion: "phase-1-v1";
    }
  | {
      state: "Saved for review";
      sourceVerdict: Extract<EntryVerdict, "Wait">;
      unresolvedConfirmationConditions: UnresolvedConfirmationCondition[];
    };
