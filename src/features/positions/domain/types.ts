export interface UserPosition {
  id: string;
  userId: string;
  tradeAlertId: string;
  entryAnalysisId: string;
  initialQuantity: 1 | 2 | 3;
  remainingQuantity: number;
  initialEntryPremium: number;
  status: "open" | "closed";
  openedAt: string;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type PositionEventType =
  | "purchase"
  | "trim"
  | "close"
  | "fill_correction"
  | "quantity_correction"
  | "note";

export interface UserPositionEvent {
  id: string;
  userPositionId: string;
  userId: string;
  eventType: PositionEventType;
  quantityDelta: number | null;
  executedPremium: number | null;
  notes: string | null;
  eventPayload: Readonly<Record<string, unknown>>;
  createdAt: string;
}

export type HostEventType =
  | "entered"
  | "added"
  | "trimmed"
  | "all_out"
  | "note";

export interface HostEvent {
  id: string;
  userId: string;
  tradeAlertId: string | null;
  userPositionId: string | null;
  traderSourceId: string | null;
  rawText: string;
  eventType: HostEventType;
  claimedEntryPremium: number | null;
  claimedExitPremium: number | null;
  claimedPercentage: number | null;
  eventPayload: Readonly<Record<string, unknown>>;
  createdAt: string;
}
