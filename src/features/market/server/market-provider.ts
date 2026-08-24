import type { MarketSnapshot } from "@/features/market/domain/snapshot";

export interface MarketProvider {
  getSnapshot(): Promise<MarketSnapshot>;
}
