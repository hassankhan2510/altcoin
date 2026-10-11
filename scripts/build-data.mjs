// Daily data build for Ascent.
//
// 1. Ask Binance which coins are trading right now (the universe).
// 2. Ask CoinGecko which CoinGecko coin each Binance ticker belongs to (exact ID mapping,
//    so two different coins sharing a symbol never get mixed up).
// 3. Pull market caps + 24h change for those coins from CoinGecko.
// 4. Keep coins with a market cap between MIN_CAP and MAX_CAP, rank by 24h market-cap % change.
// 5. Daily (--daily): write public/data/latest.json + a dated snapshot + an index (last 30 days).
//    Live (--live): write public/data/live/… every 4 hours, adding "since the last update" changes
//    (last 3 days kept). No flag = both. The workflow picks the mode from the cron that fired.
//
// Zero dependencies — runs on Node 18+ (uses built-in fetch).

import { mkdir, readFile, writeFile, readdir, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CONFIG = {
  MIN_CAP: 15_000_000,
  MAX_CAP: 2_000_000_000,
  HISTORY_DAYS: 30, // daily snapshots kept
  LIVE_KEEP: 18, // 4-hourly snapshots kept (3 days)
  // When |market-cap % change − price % change| exceeds this, the move was driven by
  // coins entering/leaving circulation (e.g. a token unlock), not by price.
  SUPPLY_FLAG_PTS: 3,
  SPARK_POINTS: 42,
};

// Stablecoins, fiat tokens and wrapped/staked copies — their "market cap growth" is minting, not demand.
const EXCLUDE = new Set([
  "USDT", "USDC", "FDUSD", "TUSD", "DAI", "USDP", "BUSD", "USDD", "PYUSD", "USDE", "USD1", "RLUSD",
  "BFUSD", "XUSD", "AEUR", "EURI", "EUR", "EURC", "TRY", "BRL", "ARS", "MXN", "PLN", "RON", "ZAR",
  "UAH", "JPY", "COP", "CZK", "IDRT", "BIDR", "UST", "USTC", "FRAX", "LUSD", "GUSD", "SUSD", "PAXG",
  "XAUT", "WBTC", "WBETH", "BETH", "BNSOL", "STETH", "WSTETH", "CBBTC", "SOLVBTC", "BTCB", "U",
]);

// Tokenized stocks / ETFs (e.g. "Coinbase (bStocks Tokenized Stock)") are not crypto assets.
const EXCLUDE_NAME = /tokeni[sz]ed (stock|equity|etf)|\bxstocks?\b|\bbstocks?\b/i;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
// ASCENT_DATA_DIR lets you test the pipeline without touching the published data.
const DATA_DIR = process.env.ASCENT_DATA_DIR ?? join(ROOT, "public", "data");
const HISTORY_DIR = join(DATA_DIR, "history");
const LIVE_DIR = join(DATA_DIR, "live");

const ARGS = new Set(process.argv.slice(2));
const DO_DAILY = ARGS.has("--daily") || !ARGS.has("--live");
const DO_LIVE = ARGS.has("--live") || !ARGS.has("--daily");

const CG_KEY = process.env.COINGECKO_API_KEY?.trim();
const CG_PRO = process.env.COINGECKO_PRO === "1";
const CG_BASE = CG_PRO ? "https://pro-api.coingecko.com/api/v3" : "https://api.coingecko.com/api/v3";
const CG_HEADERS = CG_KEY ? { [CG_PRO ? "x-cg-pro-api-key" : "x-cg-demo-api-key"]: CG_KEY } : {};
// Public (keyless) CoinGecko allows only a handful of calls per minute; a free Demo key allows 30.
const CG_GAP_MS = CG_KEY ? 2_200 : 6_500;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);

async function getJSON(url, { headers = {}, label = url, tries = 6 } = {}) {
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const res = await fetch(url, { headers: { accept: "application/json", ...headers } });
      if (res.ok) return await res.json();
      if (res.status === 429 || res.status >= 500) {
        const wait = Number(res.headers.get("retry-after")) * 1000 || Math.min(90_000, 15_000 * attempt);
        log(`${label}: HTTP ${res.status}, retrying in ${Math.round(wait / 1000)}s (${attempt}/${tries})`);
        await sleep(wait);
        continue;
      }
      throw new Error(`${label}: HTTP ${res.status} ${await res.text().catch(() => "")}`.slice(0, 300));
    } catch (err) {
      if (attempt === tries || String(err.message).includes("HTTP 4")) throw err;
      log(`${label}: ${err.message}, retrying (${attempt}/${tries})`);
      await sleep(5_000 * attempt);
    }
  }
}

let lastCg = 0;
async function cg(path, label) {
  const wait = lastCg + CG_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastCg = Date.now();
  return getJSON(`${CG_BASE}${path}`, { headers: CG_HEADERS, label });
}

// ── 1. Binance universe ────────────────────────────────────────────────────────
async function binanceBaseAssets() {
  // data-api.binance.vision is Binance's public market-data mirror; unlike api.binance.com
  // it is not geo-blocked for US-hosted runners (GitHub Actions, Vercel).
  const info = await getJSON(
    "https://data-api.binance.vision/api/v3/exchangeInfo?permissions=SPOT&symbolStatus=TRADING&showPermissionSets=false",
    { label: "binance exchangeInfo" },
  );
  const bases = new Set(info.symbols.filter((s) => s.status === "TRADING").map((s) => s.baseAsset.toUpperCase()));
  log(`Binance: ${bases.size} coins trading`);
  return bases;
}

// ── 2. Binance symbol → CoinGecko id ───────────────────────────────────────────
async function binanceCoinIds(bases) {
  const votes = new Map(); // SYMBOL -> Map(coinId -> volume)
  for (let page = 1; page <= 40; page++) {
    const { tickers = [] } = await cg(`/exchanges/binance/tickers?page=${page}`, `coingecko tickers p${page}`);
    if (!tickers.length) break;
    for (const t of tickers) {
      if (t.is_stale || t.is_anomaly || !t.coin_id) continue;
      const sym = String(t.base).toUpperCase();
      if (!bases.has(sym)) continue;
      const m = votes.get(sym) ?? new Map();
      m.set(t.coin_id, (m.get(t.coin_id) ?? 0) + (t.converted_volume?.usd ?? 0) + 1);
      votes.set(sym, m);
    }
    if (tickers.length < 100) break;
  }
  const ids = new Map(); // coinId -> SYMBOL
  for (const [sym, m] of votes) {
    const [best] = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
    ids.set(best, sym);
  }
  log(`CoinGecko: mapped ${ids.size} of ${bases.size} Binance coins`);
  return ids;
}

// ── 3. Market data ─────────────────────────────────────────────────────────────
async function markets(ids) {
  const all = [...ids];
  const out = [];
  for (let i = 0; i < all.length; i += 100) {
    const batch = all.slice(i, i + 100);
    const q = new URLSearchParams({
      vs_currency: "usd",
      ids: batch.join(","),
      per_page: "250",
      sparkline: "true",
      price_change_percentage: "24h,7d",
    });
    out.push(...(await cg(`/coins/markets?${q}`, `coingecko markets ${i / 100 + 1}`)));
  }
  log(`CoinGecko: market data for ${out.length} coins`);
  return out;
}

// ── 4. Shape ───────────────────────────────────────────────────────────────────
const round = (n, d = 2) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 10 ** d) / 10 ** d);
const tier = (cap) => (cap < 100e6 ? "small" : cap < 500e6 ? "mid" : "large");

function downsample(arr, n) {
  if (!Array.isArray(arr) || arr.length <= n) return arr ?? [];
  const step = (arr.length - 1) / (n - 1);
  return Array.from({ length: n }, (_, i) => arr[Math.round(i * step)]);
}

function shape(rows, binanceSymbolById) {
  const coins = [];
  for (const r of rows) {
    const sym = binanceSymbolById.get(r.id) ?? r.symbol.toUpperCase();
    if (EXCLUDE.has(sym) || EXCLUDE_NAME.test(r.name)) continue;
    const cap = r.market_cap;
    if (!cap || cap < CONFIG.MIN_CAP || cap > CONFIG.MAX_CAP) continue;
    const pct = r.market_cap_change_percentage_24h;
    const delta = r.market_cap_change_24h;
    if (pct == null || delta == null || !Number.isFinite(pct)) continue;
    const prev = cap - delta;
    if (prev <= 0) continue;
    const pricePct = r.price_change_percentage_24h_in_currency ?? r.price_change_percentage_24h;
    const supplyGap = pricePct == null ? 0 : pct - pricePct;
    const prices = downsample(r.sparkline_in_7d?.price, CONFIG.SPARK_POINTS);
    coins.push({
      id: r.id,
      symbol: sym,
      name: r.name,
      image: r.image,
      tier: tier(cap),
      cap: Math.round(cap),
      capPrev: Math.round(prev),
      capDelta: Math.round(delta),
      capPct: round(pct),
      price: r.current_price,
      pricePct: round(pricePct),
      price7dPct: round(r.price_change_percentage_7d_in_currency),
      volume: Math.round(r.total_volume ?? 0),
      rank: r.market_cap_rank,
      supplyDriven: Math.abs(supplyGap) >= CONFIG.SUPPLY_FLAG_PTS,
      supplyGap: round(supplyGap),
      spark: prices.map((p) => Number(p.toPrecision(5))),
      updated: r.last_updated,
      binance: `https://www.binance.com/en/trade/${sym}_USDT?type=spot`,
    });
  }
  coins.sort((a, b) => b.capPct - a.capPct);
  coins.forEach((c, i) => (c.pos = i + 1));
  return coins;
}

const fmtUsd = (n) => {
  const a = Math.abs(n);
  const s = a >= 1e9 ? `${(a / 1e9).toFixed(2)}B` : a >= 1e6 ? `${(a / 1e6).toFixed(1)}M` : `${(a / 1e3).toFixed(0)}K`;
  return `$${s}`;
};

function summarise(coins) {
  const up = coins.filter((c) => c.capPct > 0);
  const down = coins.filter((c) => c.capPct < 0);
  const sorted = coins.map((c) => c.capPct).sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  const netDelta = coins.reduce((s, c) => s + c.capDelta, 0);
  // Headline = the biggest genuine climber; supply-driven jumps are called out separately.
  const top = coins.find((c) => c.capPct > 0 && !c.supplyDriven) ?? coins[0];
  const bottom = coins.at(-1);
  const tiers = Object.fromEntries(
    ["small", "mid", "large"].map((t) => {
      const g = coins.filter((c) => c.tier === t);
      const m = g.map((c) => c.capPct).sort((a, b) => a - b);
      return [t, { count: g.length, up: g.filter((c) => c.capPct > 0).length, median: round(m[Math.floor(m.length / 2)] ?? 0) }];
    }),
  );

  const mood =
    up.length / Math.max(1, coins.length) >= 0.65 ? "a strong day"
    : up.length / Math.max(1, coins.length) >= 0.5 ? "a mildly positive day"
    : up.length / Math.max(1, coins.length) >= 0.35 ? "a mildly negative day"
    : "a weak day";

  const briefing = [];
  if (top) {
    briefing.push(
      `${top.name} grew the most: its total value went from ${fmtUsd(top.capPrev)} to ${fmtUsd(top.cap)}, up ${top.capPct.toFixed(1)}% in 24 hours.`,
    );
  }
  briefing.push(
    `Across the ${coins.length} Binance coins worth between $15M and $2B, ${up.length} grew and ${down.length} shrank — ${mood}.`,
  );
  const jump = coins.find((c) => c.capPct > 0 && c.supplyDriven);
  if (jump && jump.pos < (top?.pos ?? Infinity)) {
    briefing.push(
      `${jump.name}'s market cap jumped ${jump.capPct.toFixed(1)}%, but its price moved only ${jump.pricePct?.toFixed(1)}% — more coins are now counted in circulation, so the jump didn't come from buyers. We tag these “New supply”.`,
    );
  }

  return {
    universe: coins.length,
    up: up.length,
    down: down.length,
    flat: coins.length - up.length - down.length,
    median: round(median),
    netDelta: Math.round(netDelta),
    topId: top?.id ?? null,
    bottomId: bottom?.id ?? null,
    tiers,
    briefing,
  };
}

// ── 5. Write ───────────────────────────────────────────────────────────────────
async function main() {
  const t0 = Date.now();
  const bases = await binanceBaseAssets();
  const idMap = await binanceCoinIds(bases);
  const rows = await markets(idMap.keys());
  const coins = shape(rows, idMap);
  if (coins.length < 20) throw new Error(`Only ${coins.length} coins passed the filter — refusing to publish a suspicious dataset.`);

  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const payload = {
    version: 1,
    date,
    generatedAt: now.toISOString(),
    filters: { minCap: CONFIG.MIN_CAP, maxCap: CONFIG.MAX_CAP, exchange: "Binance (spot)", window: "24h" },
    sources: { universe: "Binance public market data", marketCap: "CoinGecko" },
    stats: { binanceCoins: bases.size, mapped: idMap.size },
    summary: summarise(coins),
    coins,
  };

  if (DO_DAILY) await writeDaily(payload);
  if (DO_LIVE) await writeLive(payload);

  log(`Done: ${coins.length} coins in range, top = ${coins[0].symbol} ${coins[0].capPct}% — ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

// ── Snapshot storage ───────────────────────────────────────────────────────────
const indexEntry = (d) => {
  const top = d.coins.find((c) => c.id === d.summary.topId) ?? d.coins[0];
  return { date: d.date, generatedAt: d.generatedAt, universe: d.summary.universe, up: d.summary.up, top: top && { symbol: top.symbol, capPct: top.capPct } };
};

/** Write latest + history/<key>.json, keep the newest `keep` snapshots, rebuild index.json. */
async function saveSnapshots(dir, payload, keep, pattern) {
  const hist = join(dir, "history");
  await mkdir(hist, { recursive: true });
  const json = JSON.stringify(payload);
  await writeFile(join(dir, "latest.json"), json);
  await writeFile(join(hist, `${payload.date}.json`), json);
  const files = (await readdir(hist)).filter((f) => pattern.test(f)).sort().reverse();
  for (const f of files.slice(keep)) await unlink(join(hist, f));
  const index = [];
  for (const f of files.slice(0, keep)) index.push(indexEntry(JSON.parse(await readFile(join(hist, f), "utf8"))));
  await writeFile(join(dir, "index.json"), JSON.stringify({ latest: payload.date, days: index }));
}

async function writeDaily(payload) {
  await saveSnapshots(DATA_DIR, { ...payload, mode: "daily" }, CONFIG.HISTORY_DAYS, /^\d{4}-\d{2}-\d{2}\.json$/);
  log(`Daily snapshot saved (${payload.date})`);
}

async function writeLive(payload) {
  // Snapshot key like "2026-10-10T0541" (UTC), so files sort by time.
  const key = payload.generatedAt.slice(0, 16).replace(":", "");
  const pattern = /^\d{4}-\d{2}-\d{2}T\d{4}\.json$/;
  const hist = join(LIVE_DIR, "history");
  await mkdir(hist, { recursive: true });

  // Compare with the previous live snapshot: value change and ranking change since then.
  const prevFile = (await readdir(hist)).filter((f) => pattern.test(f) && f !== `${key}.json`).sort().at(-1);
  const prev = prevFile ? JSON.parse(await readFile(join(hist, prevFile), "utf8")) : null;
  const before = new Map((prev?.coins ?? []).map((c) => [c.id, c]));
  const coins = payload.coins.map((c) => {
    const p = before.get(c.id);
    return {
      ...c,
      sinceCapPct: p?.cap ? round((c.cap / p.cap - 1) * 100) : null,
      posPrev: p?.pos ?? null,
      posMove: p ? p.pos - c.pos : null, // positive = moved up the ranking
    };
  });

  await saveSnapshots(LIVE_DIR, { ...payload, mode: "live", date: key, prevAt: prev?.generatedAt ?? null, coins }, CONFIG.LIVE_KEEP, pattern);
  log(`Live snapshot saved (${key})${prev ? `, compared with ${prev.date}` : ", first live snapshot"}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
