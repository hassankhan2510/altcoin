// Real Growth Score — one formula shared by the data pipeline (Node) and the website (browser).
//
// Market cap = price × coins in circulation, so a day's change splits exactly into two parts:
//   (1 + market-cap change) = (1 + price change) × (1 + supply change)
// Price growth means buyers paid more (real demand). Supply growth means more coins were counted
// (unlocks, emissions, data corrections) — the market cap rose but nobody bought anything.
//
// The score is the share of the market-cap growth that came from price, 0–100, measured in log
// terms so the price and supply shares add up exactly.

// Daily supply wobbles below this are data noise (staking rewards, rounding), not a real supply event.
export const SUPPLY_NOISE = 0.01;

export const VERDICTS = {
  real: { label: "Real", long: "Driven by buyers" },
  mixed: { label: "Mixed", long: "Partly from new coins" },
  supply: { label: "Mostly new coins", long: "Mostly from new coins, not buyers" },
  pricefell: { label: "Price fell", long: "Value rose only because of new coins; the price actually fell" },
  shrank: { label: "Shrank", long: "Total value went down" },
  flat: { label: "Too small", long: "The move is too small to judge" },
};

const r2 = (n) => Math.round(n * 100) / 100;

/**
 * @param {{capPct:number, pricePct:number|null, capPrev:number, capDelta:number}} c
 * @returns {{score:number|null, verdict:string, supplyPct:number, priceDelta:number, supplyDelta:number, realPct:number} | null}
 */
export function realGrowth({ capPct, pricePct, capPrev, capDelta }) {
  if (capPct == null || pricePct == null || !Number.isFinite(pricePct)) return null;
  const m = capPct / 100;
  const p = pricePct / 100;
  const s = (1 + m) / (1 + p) - 1;
  // What the market cap would have done if the number of coins had stayed the same.
  const priceDelta = capPrev * p;
  const out = {
    supplyPct: r2(s * 100),
    priceDelta: Math.round(priceDelta),
    supplyDelta: Math.round(capDelta - priceDelta),
    // Growth that buyers can take credit for: never more than the market-cap move itself.
    realPct: r2(Math.min(capPct, pricePct)),
  };
  if (m <= 0) return { ...out, score: null, verdict: "shrank" };
  // Price slipped and supply barely moved: a tiny wobble, not something to flag.
  if (p <= 0 && s <= SUPPLY_NOISE) return { ...out, score: null, verdict: "flat" };
  let score;
  if (p <= 0) score = 0;
  else if (s <= SUPPLY_NOISE) score = 100;
  else score = Math.round(Math.min(100, Math.max(0, (100 * Math.log1p(p)) / Math.log1p(m))));
  const verdict = p <= 0 ? "pricefell" : score >= 90 ? "real" : score >= 50 ? "mixed" : "supply";
  return { ...out, score, verdict };
}

/** Totals for coins that grew: how much of the value they added came from buyers vs new coins. */
export function realSummary(coins) {
  const grew = coins.filter((c) => c.capPct > 0 && c.verdict);
  const total = grew.reduce((s, c) => s + c.capDelta, 0);
  const fromPrice = grew.reduce((s, c) => s + c.priceDelta, 0);
  const counts = { real: 0, mixed: 0, supply: 0, pricefell: 0 };
  for (const c of grew) counts[c.verdict] = (counts[c.verdict] ?? 0) + 1;
  return {
    grew: grew.length,
    total: Math.round(total),
    fromPrice: Math.round(fromPrice),
    fromSupply: Math.round(total - fromPrice),
    realShare: total > 0 ? Math.max(0, Math.min(100, Math.round((fromPrice / total) * 100))) : null,
    counts,
  };
}
