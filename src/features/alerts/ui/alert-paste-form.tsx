"use client";

import { useState } from "react";
import { parseTradeAlert } from "@/features/alerts/domain/parser";
import type { ParsedTradeAlert } from "@/features/alerts/domain/types";
import { validateCriticalFields } from "@/features/alerts/domain/validation";
import { ParsedAlertEditor } from "@/features/alerts/ui/parsed-alert-editor";
import { TraderSourceField } from "@/features/traders/ui/trader-source-field";
import type { TraderRepository, TraderSource } from "@/features/traders/server/trader-repository";

export interface AlertPasteFormProps {
  traderRepository: TraderRepository;
  userId: string;
  submittedAt?: () => string;
  onAnalyze: (alert: ParsedTradeAlert, traderSource: TraderSource) => void;
}

export const AlertPasteForm = ({
  traderRepository,
  userId,
  submittedAt = () => new Date().toISOString(),
  onAnalyze,
}: AlertPasteFormProps) => {
  const [rawText, setRawText] = useState("");
  const [alert, setAlert] = useState<ParsedTradeAlert | null>(null);
  const [traderSource, setTraderSource] = useState<TraderSource | null>(null);

  const parseAlert = () => {
    const parsed = parseTradeAlert(rawText, submittedAt());
    if (parsed.ok) setAlert(parsed.value);
  };

  const canAnalyze =
    alert !== null && traderSource !== null && validateCriticalFields(alert).length === 0;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (alert !== null && traderSource !== null && validateCriticalFields(alert).length === 0) {
          onAnalyze(alert, traderSource);
        }
      }}
      style={{ display: "grid", gap: "1rem", maxWidth: "36rem" }}
    >
      <div>
        <label htmlFor="paste-trade-alert">Paste trade alert</label>
        <textarea
          id="paste-trade-alert"
          name="rawText"
          value={rawText}
          onChange={(event) => setRawText(event.target.value)}
        />
        <button type="button" onClick={parseAlert} disabled={rawText.trim() === ""}>
          Parse alert
        </button>
      </div>
      {alert === null ? null : (
        <ParsedAlertEditor alert={alert} onChange={setAlert} />
      )}
      <TraderSourceField
        repository={traderRepository}
        userId={userId}
        selectedSource={traderSource}
        onChange={setTraderSource}
      />
      <button type="submit" disabled={!canAnalyze}>
        Analyze entry
      </button>
    </form>
  );
};
