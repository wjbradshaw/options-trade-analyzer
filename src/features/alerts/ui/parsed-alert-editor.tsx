"use client";

import type { ChangeEvent } from "react";
import {
  isValidAlertExpiration,
  validateCriticalFields,
} from "@/features/alerts/domain/validation";
import type {
  AlertField,
  OptionSide,
  ParseIssueCode,
  ParsedTradeAlert,
} from "@/features/alerts/domain/types";

export interface ParsedAlertEditorProps {
  alert: ParsedTradeAlert;
  onChange: (alert: ParsedTradeAlert) => void;
}

const fieldLabels: Record<AlertField, string> = {
  symbol: "Ticker",
  side: "Call or put",
  strike: "Strike",
  expiration: "Expiration",
  alertedPremium: "Alerted premium",
};

const toOptionalNumber = (value: string): number | null => {
  if (value === "") return null;

  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};

const fieldError = (field: AlertField, code: ParseIssueCode): string => {
  if (field === "expiration" && code === "invalid") {
    return "Expiration must use a valid MM/DD date.";
  }

  return `${fieldLabels[field]} is required.`;
};

export const ParsedAlertEditor = ({ alert, onChange }: ParsedAlertEditorProps) => {
  const validationIssues = validateCriticalFields(alert);
  const invalidFields = new Set(validationIssues.map((issue) => issue.field));
  const issueCodes = new Map(validationIssues.map((issue) => [issue.field, issue.code]));
  const hasInvalidExpiration = !isValidAlertExpiration(alert.expiration);

  if (hasInvalidExpiration && alert.expiration !== null) {
    invalidFields.add("expiration");
    issueCodes.set("expiration", "invalid");
  }

  const update = (field: keyof ParsedTradeAlert, value: ParsedTradeAlert[keyof ParsedTradeAlert]) => {
    const next = { ...alert, [field]: value } as ParsedTradeAlert;
    onChange({ ...next, issues: validateCriticalFields(next) });
  };

  const updateText = (field: "symbol" | "expiration") => (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value.trim();
    update(field, value === "" ? null : field === "symbol" ? value.toUpperCase() : value);
  };

  return (
    <section aria-label="Corrected trade alert" style={{ display: "grid", gap: "0.75rem" }}>
      <div>
        <p>Original pasted alert</p>
        <pre
          aria-label="Original pasted alert text"
          style={{ margin: 0, maxWidth: "100%", overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}
        >
          {alert.rawText}
        </pre>
      </div>
      <div>
        <label htmlFor="alert-symbol">Ticker</label>
        <input
          aria-describedby={invalidFields.has("symbol") ? "alert-symbol-error" : undefined}
          aria-invalid={invalidFields.has("symbol")}
          id="alert-symbol"
          name="symbol"
          value={alert.symbol ?? ""}
          onChange={updateText("symbol")}
        />
        {invalidFields.has("symbol") ? (
          <p id="alert-symbol-error">{fieldError("symbol", issueCodes.get("symbol") ?? "required")}</p>
        ) : null}
      </div>
      <div>
        <label htmlFor="alert-side">Call or put</label>
        <select
          aria-describedby={invalidFields.has("side") ? "alert-side-error" : undefined}
          aria-invalid={invalidFields.has("side")}
          id="alert-side"
          name="side"
          value={alert.side ?? ""}
          onChange={(event) => update("side", (event.target.value || null) as OptionSide | null)}
        >
          <option value="">Select call or put</option>
          <option value="call">Call</option>
          <option value="put">Put</option>
        </select>
        {invalidFields.has("side") ? (
          <p id="alert-side-error">{fieldError("side", issueCodes.get("side") ?? "required")}</p>
        ) : null}
      </div>
      <div>
        <label htmlFor="alert-strike">Strike</label>
        <input
          aria-describedby={invalidFields.has("strike") ? "alert-strike-error" : undefined}
          aria-invalid={invalidFields.has("strike")}
          id="alert-strike"
          min="0.0001"
          name="strike"
          step="any"
          type="number"
          value={alert.strike ?? ""}
          onChange={(event) => update("strike", toOptionalNumber(event.target.value))}
        />
        {invalidFields.has("strike") ? (
          <p id="alert-strike-error">{fieldError("strike", issueCodes.get("strike") ?? "required")}</p>
        ) : null}
      </div>
      <div>
        <label htmlFor="alert-expiration">Expiration</label>
        <input
          aria-describedby={invalidFields.has("expiration") ? "alert-expiration-error" : undefined}
          aria-invalid={invalidFields.has("expiration")}
          id="alert-expiration"
          name="expiration"
          placeholder="MM/DD"
          value={alert.expiration ?? ""}
          onChange={updateText("expiration")}
        />
        {invalidFields.has("expiration") ? (
          <p id="alert-expiration-error">
            {fieldError("expiration", issueCodes.get("expiration") ?? "required")}
          </p>
        ) : null}
      </div>
      <div>
        <label htmlFor="alert-premium">Alerted premium</label>
        <input
          id="alert-premium"
          min="0"
          name="alertedPremium"
          step="any"
          type="number"
          value={alert.alertedPremium ?? ""}
          onChange={(event) => update("alertedPremium", toOptionalNumber(event.target.value))}
        />
      </div>
    </section>
  );
};
