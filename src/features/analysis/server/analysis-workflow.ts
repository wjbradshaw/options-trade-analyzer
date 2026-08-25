import {
  analyzeEntry,
  EntryAnalysisBlockedError,
  type AnalyzeEntryInput,
  type EntryAnalysis,
} from "@/features/analysis/domain/analyzer";
import {
  calculateDte,
  calculateMaxPremiumLoss,
} from "@/features/analysis/domain/calculations";
import type { ContextualEvidence } from "@/features/analysis/domain/factors";
import type { ParsedTradeAlert } from "@/features/alerts/domain/types";
import {
  isValidAlertExpiration,
  validateCriticalFields,
} from "@/features/alerts/domain/validation";
import {
  evaluateFreshness,
  type MarketSnapshot,
} from "@/features/market/domain/snapshot";
import type { ProfileRepository } from "@/features/profile/server/profile-repository";
import { calculateRiskAssessment, type RiskAssessment } from "@/features/profile/domain/risk";
import { err, ok, type Result } from "@/lib/result";
import type {
  AnalysisWorkflowPersistence,
  PersistedAnalysisWorkflow,
} from "./analysis-workflow-repository";

export type AnalyzeAlertErrorCode =
  | "unauthenticated"
  | "profile_missing"
  | "invalid_contract"
  | "freshness_blocked"
  | "persistence_failed"
  | "analysis_failed";

export interface AnalyzeAlertError {
  code: AnalyzeAlertErrorCode;
  message: string;
}

export interface AnalyzeAlertCommand {
  alert: ParsedTradeAlert;
  traderSourceId: string;
  marketSnapshot: MarketSnapshot;
  quantity: 1 | 2 | 3;
  plannedLoss?: number;
  catalyst?: ContextualEvidence;
  technicalAlignment?: ContextualEvidence;
  volatility?: ContextualEvidence;
  liquidity?: ContextualEvidence;
  thesis?: ContextualEvidence;
}

export interface AnalyzeAlertDependencies {
  authenticate(): Promise<string | null>;
  profileRepository: ProfileRepository;
  workflowPersistence: AnalysisWorkflowPersistence;
  now(): Date;
}

export interface DashboardEntryAnalysis extends PersistedAnalysisWorkflow {
  analysis: EntryAnalysis;
  analyzedAt: string;
  riskAssessment: RiskAssessment;
  contract: {
    symbol: string;
    side: "call" | "put";
    strike: number;
    expiration: string;
    dte: number;
    optionPremium: number;
    quantity: 1 | 2 | 3;
  };
}

const invalidContract = (): Result<never, AnalyzeAlertError> =>
  err({
    code: "invalid_contract",
    message: "Confirm ticker, call or put, positive strike, expiration, and trader source before analysis.",
  });

const formatDate = (year: number, month: number, day: number): string =>
  `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day
    .toString()
    .padStart(2, "0")}`;

const isCalendarDate = (year: number, month: number, day: number): boolean => {
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

export const resolveAlertExpiration = (
  expiration: string,
  submittedAt: string,
): string => {
  const match = /^(\d{1,2})\/(\d{1,2})$/.exec(expiration);
  const submitted = new Date(submittedAt);

  if (match === null || Number.isNaN(submitted.getTime())) {
    throw new RangeError("A valid MM/DD expiration and submitted date are required");
  }

  const month = Number(match[1]);
  const day = Number(match[2]);
  const submittedDate = formatDate(
    submitted.getUTCFullYear(),
    submitted.getUTCMonth() + 1,
    submitted.getUTCDate(),
  );

  for (let year = submitted.getUTCFullYear(); year <= submitted.getUTCFullYear() + 8; year += 1) {
    if (!isCalendarDate(year, month, day)) continue;
    const candidate = formatDate(year, month, day);
    if (candidate >= submittedDate) return candidate;
  }

  throw new RangeError("Expiration does not have a valid upcoming calendar occurrence");
};

const validateCommand = (command: AnalyzeAlertCommand): boolean =>
  validateCriticalFields(command.alert).length === 0 &&
  typeof command.alert.symbol === "string" &&
  command.alert.symbol.trim().length > 0 &&
  (command.alert.side === "call" || command.alert.side === "put") &&
  command.alert.strike !== null &&
  Number.isFinite(command.alert.strike) &&
  command.alert.strike > 0 &&
  isValidAlertExpiration(command.alert.expiration) &&
  command.traderSourceId.trim().length > 0;

const performAnalysis = async (
  dependencies: AnalyzeAlertDependencies,
  command: AnalyzeAlertCommand,
): Promise<Result<DashboardEntryAnalysis, AnalyzeAlertError>> => {
  const userId = await dependencies.authenticate();
  if (userId === null) {
    return err({ code: "unauthenticated", message: "Sign in before analyzing an alert." });
  }

  const profile = await dependencies.profileRepository.getProfile();
  if (!profile.ok) {
    return profile.error.code === "not_found"
      ? err({
          code: "profile_missing",
          message: "Set an options-only trading budget before analyzing an alert.",
        })
      : err({ code: "analysis_failed", message: "The entry analysis could not be completed." });
  }

  if (!validateCommand(command)) return invalidContract();

  try {
    const shorthandExpiration = command.alert.expiration as string;
    const canonicalExpiration = resolveAlertExpiration(
      shorthandExpiration,
      command.alert.submittedAt,
    );
    const submittedDate = new Date(command.alert.submittedAt).toISOString().slice(0, 10);
    const dte = calculateDte({ asOf: submittedDate, expiration: canonicalExpiration });
    const freshness = evaluateFreshness(
      { ...command.marketSnapshot, dte },
      dependencies.now(),
    );

    if (dte <= 1 && freshness.status !== "fresh") {
      return err({
        code: "freshness_blocked",
        message: "Confirm current option premium and underlying price before scoring this short-dated contract.",
      });
    }

    const optionPremium = command.marketSnapshot.optionPremium ?? command.alert.alertedPremium;
    if (optionPremium === null || !Number.isFinite(optionPremium) || optionPremium <= 0) {
      throw new RangeError("A positive option premium is required for risk calculation");
    }

    const maximumLoss = calculateMaxPremiumLoss({
      premium: optionPremium,
      quantity: command.quantity,
    });
    const riskAssessment = calculateRiskAssessment({
      budget: profile.value.optionsBudget,
      maxLoss: maximumLoss,
      plannedLoss: command.plannedLoss ?? maximumLoss,
      dte,
      quantity: command.quantity,
    });
    const canonicalAlert: ParsedTradeAlert = {
      ...command.alert,
      expiration: canonicalExpiration,
    };
    const analyzerInput: AnalyzeEntryInput = {
      alert: canonicalAlert,
      dte,
      riskAssessment,
      marketSnapshot: command.marketSnapshot,
      freshness,
      catalyst: command.catalyst,
      technicalAlignment: command.technicalAlignment,
      volatility: command.volatility,
      liquidity: command.liquidity,
      thesis: command.thesis,
    };
    const analysis = analyzeEntry(analyzerInput);
    const analyzedAt = dependencies.now().toISOString();
    const persisted = await dependencies.workflowPersistence.commitCompletedAnalysis({
      userId,
      traderSourceId: command.traderSourceId,
      alert: canonicalAlert,
      correctedFields: {
        symbol: command.alert.symbol,
        side: command.alert.side,
        strike: command.alert.strike,
        expiration: shorthandExpiration,
        alertedPremium: command.alert.alertedPremium,
        tags: command.alert.tags,
      },
      marketSnapshot: command.marketSnapshot,
      dte,
      riskAssessment,
      analysis,
      analyzedAt,
    });

    if (!persisted.ok) {
      return err({ code: "persistence_failed", message: persisted.error.message });
    }

    return ok({
      ...persisted.value,
      analysis,
      analyzedAt,
      riskAssessment,
      contract: {
        symbol: canonicalAlert.symbol as string,
        side: canonicalAlert.side as "call" | "put",
        strike: canonicalAlert.strike as number,
        expiration: canonicalExpiration,
        dte,
        optionPremium,
        quantity: command.quantity,
      },
    });
  } catch (error) {
    if (error instanceof EntryAnalysisBlockedError) {
      if (error.code === "freshness_blocked") {
        return err({
          code: "freshness_blocked",
          message: "Confirm current option premium and underlying price before scoring this short-dated contract.",
        });
      }
      return invalidContract();
    }

    return err({
      code: "analysis_failed",
      message: "The entry analysis could not be completed.",
    });
  }
};

export const createAnalyzeAlertForDashboard =
  (dependencies: AnalyzeAlertDependencies) =>
  (command: AnalyzeAlertCommand): Promise<Result<DashboardEntryAnalysis, AnalyzeAlertError>> =>
    performAnalysis(dependencies, command);

export const createAnalyzeAlert =
  (dependencies: AnalyzeAlertDependencies) =>
  async (command: AnalyzeAlertCommand): Promise<Result<EntryAnalysis, AnalyzeAlertError>> => {
    const result = await performAnalysis(dependencies, command);
    return result.ok ? ok(result.value.analysis) : result;
  };
