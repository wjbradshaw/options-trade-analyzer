"use client";

import { useState } from "react";
import type { UserPosition, UserPositionEvent } from "../domain/types";
import {
  calculatePositionMetrics,
  evaluatePositionMilestones,
} from "../domain/calculations";
import {
  evaluatePositionHealth,
  type PositionHealthInput,
} from "../domain/health-monitor";
import type { Result } from "@/lib/result";
import type { RepositoryError } from "@/lib/supabase/repository-error";

export interface ContractDetails {
  symbol: string;
  strike: number;
  optionSide: "call" | "put";
  expiration: string;
}

export interface ActivePositionCardProps {
  position: UserPosition;
  contractDetails: ContractDetails;
  events: UserPositionEvent[];
  currentOptionPrice: number;
  underlyingPrice: number;
  entryUnderlyingPrice: number;
  invalidationLevel: number;
  targetLevel: number;
  dte: number;
  initialDte: number;
  currentIv: number;
  entryIv: number;
  bid: number;
  ask: number;
  thesisIntact: boolean;
  onTrim: (trimQuantity: number, exitPremium: number, notes?: string) => Promise<Result<unknown, RepositoryError>>;
  onClose: (exitPremium: number, notes?: string) => Promise<Result<unknown, RepositoryError>>;
}

export const ActivePositionCard = ({
  position,
  contractDetails,
  events,
  currentOptionPrice,
  underlyingPrice,
  entryUnderlyingPrice,
  invalidationLevel,
  targetLevel,
  dte,
  initialDte,
  currentIv,
  entryIv,
  bid,
  ask,
  thesisIntact,
  onTrim,
  onClose,
}: ActivePositionCardProps) => {
  const [showTrimModal, setShowTrimModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [trimQuantity, setTrimQuantity] = useState(1);
  const [exitPrice, setExitPrice] = useState(currentOptionPrice.toString());
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const metrics = calculatePositionMetrics(position, events, currentOptionPrice);

  const milestoneAlert = evaluatePositionMilestones(position, currentOptionPrice, {
    thesisIntact,
    invalidationBreached:
      contractDetails.optionSide === "call"
        ? underlyingPrice <= invalidationLevel
        : underlyingPrice >= invalidationLevel,
  });

  const healthInput: PositionHealthInput = {
    underlyingPrice,
    entryUnderlyingPrice,
    invalidationLevel,
    targetLevel,
    optionSide: contractDetails.optionSide,
    dte,
    initialDte,
    currentIv,
    entryIv,
    bid,
    ask,
    thesisIntact,
  };

  const health = evaluatePositionHealth(healthInput);

  const handleTrimSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const parsedPrice = Number(exitPrice);
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      setError("Exit price must be a positive number.");
      setSubmitting(false);
      return;
    }

    const result = await onTrim(trimQuantity, parsedPrice, notes);
    setSubmitting(false);
    if (result.ok) {
      setShowTrimModal(false);
      setNotes("");
    } else {
      setError(result.error.message);
    }
  };

  const handleCloseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const parsedPrice = Number(exitPrice);
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      setError("Exit price must be a positive number.");
      setSubmitting(false);
      return;
    }

    const result = await onClose(parsedPrice, notes);
    setSubmitting(false);
    if (result.ok) {
      setShowCloseModal(false);
      setNotes("");
    } else {
      setError(result.error.message);
    }
  };

  return (
    <article
      aria-label={`Position ${contractDetails.symbol}`}
      style={{
        border: "1px solid #374151",
        borderRadius: "8px",
        padding: "16px",
        marginBottom: "16px",
        backgroundColor: "#111827",
        color: "#f9fafb",
      }}
    >
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: "bold" }}>
            {contractDetails.symbol} {contractDetails.strike} {contractDetails.optionSide.toUpperCase()}
          </h3>
          <p style={{ margin: "4px 0", color: "#9ca3af", fontSize: "0.875rem" }}>
            {position.remainingQuantity} {position.remainingQuantity === 1 ? "contract" : "contracts"} @ ${position.initialEntryPremium.toFixed(2)}
            {metrics.isRunner ? " (RUNNER)" : ""} • Exp {contractDetails.expiration} ({dte} DTE)
          </p>
        </div>
        <div style={{ textAlign: "right" }}>
          <span
            style={{
              padding: "4px 8px",
              borderRadius: "4px",
              fontSize: "0.75rem",
              fontWeight: "bold",
              backgroundColor:
                health.healthStatus === "healthy"
                  ? "#065f46"
                  : health.healthStatus === "caution"
                    ? "#92400e"
                    : "#991b1b",
              color: "#ffffff",
            }}
          >
            {health.healthStatus.toUpperCase()} ({health.healthScore}/100)
          </span>
        </div>
      </header>

      {/* Gain & P&L row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px", margin: "16px 0", padding: "12px", backgroundColor: "#1f2937", borderRadius: "6px" }}>
        <div>
          <span style={{ fontSize: "0.75rem", color: "#9ca3af" }}>Return</span>
          <div style={{ fontSize: "1.1rem", fontWeight: "bold", color: metrics.currentGainPercentage >= 0 ? "#34d399" : "#f87171" }}>
            {metrics.currentGainPercentage >= 0 ? `+${metrics.currentGainPercentage}%` : `${metrics.currentGainPercentage}%`}
          </div>
        </div>
        <div>
          <span style={{ fontSize: "0.75rem", color: "#9ca3af" }}>Total P&L</span>
          <div style={{ fontSize: "1.1rem", fontWeight: "bold", color: metrics.totalPnl >= 0 ? "#34d399" : "#f87171" }}>
            ${metrics.totalPnl.toFixed(2)}
          </div>
        </div>
        <div>
          <span style={{ fontSize: "0.75rem", color: "#9ca3af" }}>Capital Recovered</span>
          <div style={{ fontSize: "1.1rem", fontWeight: "bold", color: "#60a5fa" }}>
            {metrics.capitalRecoveredPercentage}% (${metrics.capitalRecovered.toFixed(2)})
          </div>
        </div>
      </div>

      {/* Active Milestone Alert */}
      {milestoneAlert && (
        <div
          role="alert"
          style={{
            padding: "10px",
            marginBottom: "16px",
            borderRadius: "6px",
            borderLeft: `4px solid ${milestoneAlert.severity === "urgent" ? "#ef4444" : "#f59e0b"}`,
            backgroundColor: milestoneAlert.severity === "urgent" ? "#450a0a" : "#451a03",
          }}
        >
          <div style={{ fontWeight: "bold", color: milestoneAlert.severity === "urgent" ? "#fca5a5" : "#fcd34d" }}>
            {milestoneAlert.headline}
          </div>
          <div style={{ fontSize: "0.875rem", marginTop: "2px", color: "#e5e7eb" }}>
            {milestoneAlert.description}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <footer style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
        {position.status === "open" && position.remainingQuantity > 1 && (
          <button
            type="button"
            onClick={() => {
              setExitPrice(currentOptionPrice.toString());
              setShowTrimModal(true);
            }}
            style={{
              padding: "8px 16px",
              backgroundColor: "#2563eb",
              color: "#ffffff",
              border: "none",
              borderRadius: "4px",
              fontWeight: "500",
              cursor: "pointer",
            }}
          >
            Trim
          </button>
        )}
        {position.status === "open" && (
          <button
            type="button"
            onClick={() => {
              setExitPrice(currentOptionPrice.toString());
              setShowCloseModal(true);
            }}
            style={{
              padding: "8px 16px",
              backgroundColor: "#dc2626",
              color: "#ffffff",
              border: "none",
              borderRadius: "4px",
              fontWeight: "500",
              cursor: "pointer",
            }}
          >
            Close
          </button>
        )}
      </footer>

      {/* Trim Modal Dialog */}
      {showTrimModal && (
        <div
          role="dialog"
          aria-label="Trim position"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.75)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 50,
          }}
        >
          <form
            onSubmit={handleTrimSubmit}
            style={{
              backgroundColor: "#1f2937",
              padding: "24px",
              borderRadius: "8px",
              width: "100%",
              maxWidth: "400px",
              boxShadow: "0 20px 25px -5px rgba(0,0,0,0.5)",
            }}
          >
            <h4 style={{ margin: "0 0 16px 0", fontSize: "1.1rem" }}>Trim Position</h4>
            {error && <p role="alert" style={{ color: "#ef4444" }}>{error}</p>}
            <div style={{ marginBottom: "12px" }}>
              <label htmlFor="trim-quantity" style={{ display: "block", marginBottom: "4px", fontSize: "0.875rem" }}>
                Quantity to Trim (Max {position.remainingQuantity - 1})
              </label>
              <select
                id="trim-quantity"
                value={trimQuantity}
                onChange={(e) => setTrimQuantity(Number(e.target.value))}
                style={{ width: "100%", padding: "8px", borderRadius: "4px", backgroundColor: "#374151", color: "#fff", border: "1px solid #4b5563" }}
              >
                {Array.from({ length: position.remainingQuantity - 1 }, (_, i) => i + 1).map((q) => (
                  <option key={q} value={q}>
                    {q}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: "12px" }}>
              <label htmlFor="trim-price" style={{ display: "block", marginBottom: "4px", fontSize: "0.875rem" }}>
                Exit Price per Contract
              </label>
              <input
                id="trim-price"
                type="number"
                step="any"
                value={exitPrice}
                onChange={(e) => setExitPrice(e.target.value)}
                style={{ width: "100%", padding: "8px", borderRadius: "4px", backgroundColor: "#374151", color: "#fff", border: "1px solid #4b5563" }}
                required
              />
            </div>
            <div style={{ marginBottom: "16px" }}>
              <label htmlFor="trim-notes" style={{ display: "block", marginBottom: "4px", fontSize: "0.875rem" }}>
                Notes (Optional)
              </label>
              <input
                id="trim-notes"
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. 50% profit milestone trim"
                style={{ width: "100%", padding: "8px", borderRadius: "4px", backgroundColor: "#374151", color: "#fff", border: "1px solid #4b5563" }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button
                type="button"
                onClick={() => setShowTrimModal(false)}
                disabled={submitting}
                style={{ padding: "8px 16px", backgroundColor: "#4b5563", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                style={{ padding: "8px 16px", backgroundColor: "#2563eb", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }}
              >
                {submitting ? "Submitting..." : "Confirm Trim"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Close Modal Dialog */}
      {showCloseModal && (
        <div
          role="dialog"
          aria-label="Close position"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.75)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 50,
          }}
        >
          <form
            onSubmit={handleCloseSubmit}
            style={{
              backgroundColor: "#1f2937",
              padding: "24px",
              borderRadius: "8px",
              width: "100%",
              maxWidth: "400px",
              boxShadow: "0 20px 25px -5px rgba(0,0,0,0.5)",
            }}
          >
            <h4 style={{ margin: "0 0 16px 0", fontSize: "1.1rem" }}>Close Position</h4>
            {error && <p role="alert" style={{ color: "#ef4444" }}>{error}</p>}
            <p style={{ fontSize: "0.875rem", color: "#9ca3af", marginBottom: "12px" }}>
              This will close all {position.remainingQuantity} remaining {position.remainingQuantity === 1 ? "contract" : "contracts"}.
            </p>
            <div style={{ marginBottom: "12px" }}>
              <label htmlFor="close-price" style={{ display: "block", marginBottom: "4px", fontSize: "0.875rem" }}>
                Final Exit Price
              </label>
              <input
                id="close-price"
                type="number"
                step="any"
                value={exitPrice}
                onChange={(e) => setExitPrice(e.target.value)}
                style={{ width: "100%", padding: "8px", borderRadius: "4px", backgroundColor: "#374151", color: "#fff", border: "1px solid #4b5563" }}
                required
              />
            </div>
            <div style={{ marginBottom: "16px" }}>
              <label htmlFor="close-notes" style={{ display: "block", marginBottom: "4px", fontSize: "0.875rem" }}>
                Notes (Optional)
              </label>
              <input
                id="close-notes"
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Target reached / closed full"
                style={{ width: "100%", padding: "8px", borderRadius: "4px", backgroundColor: "#374151", color: "#fff", border: "1px solid #4b5563" }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button
                type="button"
                onClick={() => setShowCloseModal(false)}
                disabled={submitting}
                style={{ padding: "8px 16px", backgroundColor: "#4b5563", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                style={{ padding: "8px 16px", backgroundColor: "#dc2626", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }}
              >
                {submitting ? "Closing..." : "Confirm Close"}
              </button>
            </div>
          </form>
        </div>
      )}
    </article>
  );
};
