export interface PositionHealthInput {
  underlyingPrice: number;
  entryUnderlyingPrice: number;
  invalidationLevel: number;
  targetLevel: number;
  optionSide: "call" | "put";
  dte: number;
  initialDte: number;
  currentIv: number;
  entryIv: number;
  bid: number;
  ask: number;
  thesisIntact: boolean;
}

export type HealthStatus = "healthy" | "caution" | "critical";

export interface PositionHealthFactor {
  category: "priceAlignment" | "timeDecay" | "volatilityFit" | "liquiditySpread" | "thesisIntegrity";
  weight: number;
  earnedPoints: number;
  summary: string;
}

export interface PositionHealthResult {
  healthScore: number;
  healthStatus: HealthStatus;
  factors: PositionHealthFactor[];
  summary: string;
  actionableAdvisory: string;
}

export const evaluatePositionHealth = (
  input: PositionHealthInput,
): PositionHealthResult => {
  const factors: PositionHealthFactor[] = [];

  // 1. Price Alignment (Weight: 30)
  let priceScore = 0;
  let priceSummary = "";
  const isCall = input.optionSide === "call";

  if (isCall) {
    if (input.underlyingPrice <= input.invalidationLevel) {
      priceScore = 0;
      priceSummary = `Underlying (${input.underlyingPrice}) breached invalidation (${input.invalidationLevel}).`;
    } else if (input.underlyingPrice >= input.targetLevel) {
      priceScore = 30;
      priceSummary = `Underlying (${input.underlyingPrice}) reached target level (${input.targetLevel}).`;
    } else if (input.underlyingPrice >= input.entryUnderlyingPrice) {
      priceScore = 25;
      priceSummary = `Underlying is progressing positively toward target.`;
    } else {
      priceScore = 12;
      priceSummary = `Underlying is below entry but holding above invalidation.`;
    }
  } else {
    if (input.underlyingPrice >= input.invalidationLevel) {
      priceScore = 0;
      priceSummary = `Underlying (${input.underlyingPrice}) breached invalidation (${input.invalidationLevel}).`;
    } else if (input.underlyingPrice <= input.targetLevel) {
      priceScore = 30;
      priceSummary = `Underlying (${input.underlyingPrice}) reached target level (${input.targetLevel}).`;
    } else if (input.underlyingPrice <= input.entryUnderlyingPrice) {
      priceScore = 25;
      priceSummary = `Underlying is progressing favorably toward target.`;
    } else {
      priceScore = 12;
      priceSummary = `Underlying is above entry but holding below invalidation.`;
    }
  }

  factors.push({
    category: "priceAlignment",
    weight: 30,
    earnedPoints: priceScore,
    summary: priceSummary,
  });

  // 2. Time Decay / DTE (Weight: 25)
  let timeScore = 0;
  let timeSummary = "";
  if (input.dte === 0) {
    timeScore = 5;
    timeSummary = "0-DTE: Severe theta decay occurring throughout trading session.";
  } else if (input.dte === 1) {
    timeScore = 10;
    timeSummary = "1-DTE: High overnight and intra-day theta decay pressure.";
  } else if (input.dte >= 7) {
    timeScore = 25;
    timeSummary = `${input.dte} DTE: Ample time remaining with manageable theta decay.`;
  } else if (input.dte >= 3) {
    timeScore = 20;
    timeSummary = `${input.dte} DTE: Entering steeper decay curve; monitor timeline.`;
  } else {
    timeScore = 14;
    timeSummary = `${input.dte} DTE: Fast time decay; rapid resolution needed.`;
  }

  factors.push({
    category: "timeDecay",
    weight: 25,
    earnedPoints: timeScore,
    summary: timeSummary,
  });

  // 3. Volatility / IV Fit (Weight: 20)
  let ivScore = 0;
  let ivSummary = "";
  const ivChangePct = input.entryIv > 0
    ? ((input.currentIv - input.entryIv) / input.entryIv) * 100
    : 0;

  if (ivChangePct >= 0) {
    ivScore = 20;
    ivSummary = `Implied volatility steady/expanding (${input.currentIv}% vs entry ${input.entryIv}%).`;
  } else if (ivChangePct >= -15) {
    ivScore = 15;
    ivSummary = `Mild IV compression (${ivChangePct.toFixed(1)}%).`;
  } else if (ivChangePct >= -30) {
    ivScore = 10;
    ivSummary = `Moderate IV crush (${ivChangePct.toFixed(1)}%).`;
  } else {
    ivScore = 4;
    ivSummary = `Severe IV crush (${ivChangePct.toFixed(1)}%); contract losing premium rapidly.`;
  }

  factors.push({
    category: "volatilityFit",
    weight: 20,
    earnedPoints: ivScore,
    summary: ivSummary,
  });

  // 4. Liquidity & Spread Quality (Weight: 15)
  let liqScore = 0;
  let liqSummary = "";
  const mid = (input.bid + input.ask) / 2;
  const spreadPct = mid > 0 ? (input.ask - input.bid) / mid : 1;

  if (spreadPct <= 0.05) {
    liqScore = 15;
    liqSummary = `Tight bid-ask spread (${(spreadPct * 100).toFixed(1)}%); optimal execution liquidity.`;
  } else if (spreadPct <= 0.12) {
    liqScore = 12;
    liqSummary = `Acceptable spread (${(spreadPct * 100).toFixed(1)}%).`;
  } else if (spreadPct <= 0.25) {
    liqScore = 8;
    liqSummary = `Widened spread (${(spreadPct * 100).toFixed(1)}%); moderate slippage risk.`;
  } else {
    liqScore = 2;
    liqSummary = `Wide spread (${(spreadPct * 100).toFixed(1)}%); high exit slippage penalty.`;
  }

  factors.push({
    category: "liquiditySpread",
    weight: 15,
    earnedPoints: liqScore,
    summary: liqSummary,
  });

  // 5. Thesis Integrity (Weight: 10)
  const thesisScore = input.thesisIntact ? 10 : 0;
  const thesisSummary = input.thesisIntact
    ? "Catalyst and fundamental thesis remain valid."
    : "Catalyst or premise invalidated by recent market action/news.";

  factors.push({
    category: "thesisIntegrity",
    weight: 10,
    earnedPoints: thesisScore,
    summary: thesisSummary,
  });

  const totalScore = factors.reduce((sum, f) => sum + f.earnedPoints, 0);

  let healthStatus: HealthStatus = "caution";
  let actionableAdvisory = "";

  if (totalScore >= 80) {
    healthStatus = "healthy";
    actionableAdvisory = "Position is performing well. Maintain plan targets and trail invalidation.";
  } else if (totalScore < 40) {
    healthStatus = "critical";
    actionableAdvisory = "Urgent review recommended: Key technical, time, or volatility factors have deteriorated.";
  } else {
    healthStatus = "caution";
    actionableAdvisory = "Caution: Position exhibits time decay or moderate factor deterioration. Re-evaluate holding thesis.";
  }

  return {
    healthScore: totalScore,
    healthStatus,
    factors,
    summary: `Position Health: ${totalScore}/100 (${healthStatus.toUpperCase()})`,
    actionableAdvisory,
  };
};
