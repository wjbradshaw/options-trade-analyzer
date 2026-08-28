export interface ReconciliationItem {
  positionId: string;
  symbol: string;
  strike: number;
  optionSide: "call" | "put";
  remainingQuantity: number;
  isConfirmed: boolean;
  notes?: string;
}

export interface DailyReconciliationState {
  date: string;
  items: ReconciliationItem[];
  isFullyReconciled: boolean;
}

export const createDailyReconciliation = (
  date: string,
  items: Omit<ReconciliationItem, "isConfirmed">[],
): DailyReconciliationState => {
  const reconciliationItems: ReconciliationItem[] = items.map((item) => ({
    ...item,
    isConfirmed: false,
  }));

  return {
    date,
    items: reconciliationItems,
    isFullyReconciled: reconciliationItems.length === 0,
  };
};

export const toggleItemConfirmation = (
  state: DailyReconciliationState,
  positionId: string,
): DailyReconciliationState => {
  const updatedItems = state.items.map((item) =>
    item.positionId === positionId
      ? { ...item, isConfirmed: !item.isConfirmed }
      : item,
  );

  const isFullyReconciled = updatedItems.every((item) => item.isConfirmed);

  return {
    ...state,
    items: updatedItems,
    isFullyReconciled,
  };
};
