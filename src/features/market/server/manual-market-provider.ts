import type { MarketSnapshot } from "@/features/market/domain/snapshot";
import type { MarketProvider } from "@/features/market/server/market-provider";

export class ManualMarketProvider implements MarketProvider {
  constructor(private readonly snapshot: MarketSnapshot) {}

  getSnapshot(): Promise<MarketSnapshot> {
    return Promise.resolve(this.snapshot);
  }
}
