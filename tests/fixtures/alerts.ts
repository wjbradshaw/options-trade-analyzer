export const alertFixtures = [
  {
    raw: "NBIS 8/14 220c @2.98 ER LOTTO",
    expected: {
      symbol: "NBIS",
      expirationText: "8/14",
      strike: 220,
      side: "call",
      alertedPremium: 2.98,
    },
  },
  {
    raw: "spx 8/13 7810c @2.70 submitted 8/12 9:39am",
    expected: {
      symbol: "SPX",
      expirationText: "8/13",
      strike: 7810,
      side: "call",
      alertedPremium: 2.7,
    },
  },
  {
    raw: "SNDK 8/14 1800 call @1.70 lotto",
    expected: {
      symbol: "SNDK",
      expirationText: "8/14",
      strike: 1800,
      side: "call",
      alertedPremium: 1.7,
    },
  },
] as const;
