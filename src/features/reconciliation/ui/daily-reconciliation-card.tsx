"use client";

import { useState } from "react";
import {
  type DailyReconciliationState,
  toggleItemConfirmation,
} from "../domain/reconciliation";

export interface DailyReconciliationCardProps {
  initialState: DailyReconciliationState;
  onCompleteReconciliation: (state: DailyReconciliationState) => Promise<void>;
}

export const DailyReconciliationCard = ({
  initialState,
  onCompleteReconciliation,
}: DailyReconciliationCardProps) => {
  const [state, setState] = useState(initialState);
  const [saving, setSaving] = useState(false);
  const [completed, setCompleted] = useState(initialState.isFullyReconciled);

  const handleToggle = (positionId: string) => {
    setState((prev) => toggleItemConfirmation(prev, positionId));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await onCompleteReconciliation(state);
    setSaving(false);
    setCompleted(true);
  };

  if (state.items.length === 0) {
    return null;
  }

  return (
    <section
      aria-label="Daily position reconciliation"
      style={{
        border: "1px solid #4b5563",
        borderRadius: "8px",
        padding: "16px",
        marginBottom: "16px",
        backgroundColor: "#1f2937",
        color: "#f9fafb",
      }}
    >
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: "1.1rem" }}>Daily Reconciliation ({state.date})</h3>
          <p style={{ margin: "4px 0", color: "#9ca3af", fontSize: "0.875rem" }}>
            Verify that your active positions match your actual brokerage holdings.
          </p>
        </div>
        {completed && (
          <span style={{ backgroundColor: "#065f46", color: "#34d399", padding: "4px 8px", borderRadius: "4px", fontSize: "0.75rem", fontWeight: "bold" }}>
            RECONCILED
          </span>
        )}
      </header>

      <form onSubmit={handleSubmit}>
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 16px 0" }}>
          {state.items.map((item) => (
            <li
              key={item.positionId}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 0",
                borderBottom: "1px solid #374151",
              }}
            >
              <div>
                <strong>{item.symbol} {item.strike} {item.optionSide.toUpperCase()}</strong>
                <span style={{ marginLeft: "8px", color: "#9ca3af", fontSize: "0.875rem" }}>
                  ({item.remainingQuantity} {item.remainingQuantity === 1 ? "contract" : "contracts"})
                </span>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "0.875rem" }}>
                <input
                  type="checkbox"
                  checked={item.isConfirmed}
                  disabled={saving || completed}
                  onChange={() => handleToggle(item.positionId)}
                />
                Confirmed
              </label>
            </li>
          ))}
        </ul>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            type="submit"
            disabled={saving || completed || !state.isFullyReconciled}
            style={{
              padding: "8px 16px",
              backgroundColor: state.isFullyReconciled ? "#059669" : "#4b5563",
              color: "#ffffff",
              border: "none",
              borderRadius: "4px",
              fontWeight: "500",
              cursor: state.isFullyReconciled ? "pointer" : "not-allowed",
            }}
          >
            {completed
              ? "Reconciled"
              : saving
                ? "Saving..."
                : "Complete Daily Reconciliation"}
          </button>
        </div>
      </form>
    </section>
  );
};
