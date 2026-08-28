"use client";

import type { UserPosition, UserPositionEvent } from "../domain/types";
import {
  ActivePositionCard,
  type ContractDetails,
} from "./active-position-card";
import type { Result } from "@/lib/result";
import type { RepositoryError } from "@/lib/supabase/repository-error";

export interface EnrichedActivePosition {
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
}

export interface ActivePositionsListProps {
  positions: EnrichedActivePosition[];
  onTrim: (positionId: string, trimQuantity: number, exitPremium: number, notes?: string) => Promise<Result<unknown, RepositoryError>>;
  onClose: (positionId: string, exitPremium: number, notes?: string) => Promise<Result<unknown, RepositoryError>>;
}

export const ActivePositionsList = ({
  positions,
  onTrim,
  onClose,
}: ActivePositionsListProps) => {
  if (positions.length === 0) {
    return (
      <section aria-label="Active positions">
        <h2>Active Positions</h2>
        <p style={{ color: "#9ca3af" }}>No open positions.</p>
      </section>
    );
  }

  return (
    <section aria-label="Active positions">
      <h2>Active Positions ({positions.length})</h2>
      {positions.map((item) => (
        <ActivePositionCard
          key={item.position.id}
          position={item.position}
          contractDetails={item.contractDetails}
          events={item.events}
          currentOptionPrice={item.currentOptionPrice}
          underlyingPrice={item.underlyingPrice}
          entryUnderlyingPrice={item.entryUnderlyingPrice}
          invalidationLevel={item.invalidationLevel}
          targetLevel={item.targetLevel}
          dte={item.dte}
          initialDte={item.initialDte}
          currentIv={item.currentIv}
          entryIv={item.entryIv}
          bid={item.bid}
          ask={item.ask}
          thesisIntact={item.thesisIntact}
          onTrim={(qty, exit, notes) => onTrim(item.position.id, qty, exit, notes)}
          onClose={(exit, notes) => onClose(item.position.id, exit, notes)}
        />
      ))}
    </section>
  );
};
