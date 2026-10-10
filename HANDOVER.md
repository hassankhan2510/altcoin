# Developer Handover: Ascent (repo: `altcoin`)

This document holds everything a new developer needs to pick up this project: what it is, why it was built this way, how it works, where it lives, and how to ship changes. Read it top to bottom once; after that the sections work as a reference.

---

## 1. Where things live

| Thing | Location |
|---|---|
| GitHub repository | https://github.com/hassankhan2510/altcoin |
| Default branch | `main` |
| Live website (GitHub Pages) | https://hassankhan2510.github.io/altcoin/ |
| Daily job + deploy logs | https://github.com/hassankhan2510/altcoin/actions |
| Workflow file | `.github/workflows/daily.yml` |
| Original local folder | `D:\gen ai\personal reserch\newwork` (owner's Windows machine) |

### Git setup used for this repo

The repository was created on GitHub and connected with:

```bash
git init
git add .
git commit -m "first commit"
git branch -M main
git remote add origin https://github.com/hassankhan2510/altcoin.git
git push -u origin main
```

### Starting work as a new developer

```bash
git clone https://github.com/hassankhan2510/altcoin.git
cd altcoin
git pull                      # always pull first; the bot commits new data every day
# ...make changes...
git add .
git commit -m "describe your change"
git push origin main          # pushing to main redeploys the website automatically
```

> **Important:** a bot commits to `main` every day (`data: YYYY-MM-DD`). Always `git pull` (or `git pull --rebase`) before you push, or your push will be rejected.

For larger changes, use a feature branch and open a Pull Request into `main`:

```bash
git checkout -b feature/my-change
git push -u origin feature/my-change
```

---

## 2. What the product is

**Ascent** is a daily, automatically updated dashboard for a fintech investment-summit pitch. "Ascent" is a placeholder brand name; the repo is called `altcoin`.

**The question it answers every day:**
> Of all the coins trading on **Binance** with a market cap between **$15 million and $2 billion**, which ones grew the most in **market cap, in percent**, over the **last 24 hours**?

**Why percent and not dollars:** a $20M coin that gains $10M has grown **+50%**, while a $100M coin that gains the same $10M has grown **+10%**. The smaller coin ranks higher. This rule comes straight from the product owner's specification.

### Requirements from the product owner

1. Universe: Binance coins only.
2. Filter: market cap of at least $15M and at most $2B.
3. Rank: every coin sorted by 24h market-cap change in %, highest first. Show all of them, not just the top few.
4. Runs automatically every day at a fixed time.
5. A **professional, premium, production-ready** dashboard that is **unique**, not a generic AI-template look.
6. **Simple enough that a grandmother could understand it.** Plain words, large type, one-sentence explanations.
7. **Free hosting only.**

---

## 3. Key decisions (and why)

| Decision | Why |
|---|---|
| **GitHub Actions + GitHub Pages** for hosting | 100% free, no server, scheduled jobs built in. |
| **Not Vercel** (though it's supported, see §9) | Vercel's free Hobby plan is non-commercial only, and this is a startup pitch. |
| Binance data from **`data-api.binance.vision`**, not `api.binance.com` | `api.binance.com` returns HTTP 451 for US IPs, and GitHub runners are in the US. `data-api.binance.vision` is Binance's official public market-data mirror and isn't geo-blocked. |
| **CoinGecko** for market caps | Binance's API has no market cap. CoinGecko gives `market_cap` and `market_cap_change_percentage_24h` directly, for free. |
| Coin matching via **CoinGecko's Binance tickers** (`/exchanges/binance/tickers`) | Many coins share a ticker symbol. This endpoint gives the exact CoinGecko `coin_id` for each Binance pair, so coins never get mixed up. 506 of 507 Binance coins matched on the first run. |
| **Static site, no build step** (plain HTML/CSS/JS) | Nothing can break in a build at demo time. It loads fast and is easy to host anywhere. |
| **Zero npm dependencies** | Nothing to install, nothing to go out of date, no supply-chain risk. Node 18+ has `fetch` built in. |
| Data stored as **JSON committed to the repo** | Free "database"; gives full history and an audit trail in git. |
| **Real Growth Score (0–100)**, the product's signature feature | Found on day one: OpenLedger showed **+380%** market cap while its price only rose **+3.4%**. CoinGecko had revised its circulating supply, so nobody was actually buying. Since market cap = price × circulating supply, every move splits exactly into a **price part (buyers)** and a **supply part (new coins)**. The score is the price part's share. Coins with mostly supply-driven growth **stay in the ranked table** (true to the spec) but are **left out of the headline and top-three podium**, and get their own section on the Real Growth page. Pitch line: *"Other dashboards show which coins grew. Ascent shows which growth is real."* |
| **One formula file shared by pipeline and website** (`public/score.js`) | The score can never differ between the saved data and what the page shows. Older snapshots without the score are scored in the browser. |
| **Exclude stablecoins, wrapped tokens, tokenized stocks** | Their "market cap growth" is minting or represents equity, not crypto demand. Coinbase/Intel "bStocks" tokens showed up on the first run and were removed. |

---

## 4. Architecture

```
┌──────────────────────── GitHub Actions (daily 00:05 UTC) ────────────────────────┐
│                                                                                   │
│  scripts/build-data.mjs                                                           │
│   1. Binance  data-api.binance.vision/api/v3/exchangeInfo  → coins TRADING (~507) │
│   2. CoinGecko /exchanges/binance/tickers (≈15 pages)      → exact coin IDs       │
│   3. CoinGecko /coins/markets?ids=… (batches of 100)       → mcap, 24h Δ, price,  │
│                                                              7-day sparkline      │
│   4. Filter $15M–$2B · exclude stables/wrapped/stocks · rank by 24h mcap %        │
│   5. Write public/data/latest.json                                                │
│            public/data/history/YYYY-MM-DD.json                                    │
│            public/data/index.json                                                 │
│                                                                                   │
│  → git commit "data: YYYY-MM-DD" → push to main                                   │
│  → upload public/ → deploy to GitHub Pages                                        │
└───────────────────────────────────────────────────────────────────────────────────┘
                                         │
                                         ▼
                 https://hassankhan2510.github.io/altcoin/  (static site reads the JSON)
```

### Repository layout

```
.
├── .github/workflows/daily.yml   # schedule + data job + Pages deploy
├── .claude/launch.json           # local preview config for Claude Code (optional)
├── public/                       # THE WEBSITE: this folder is what gets deployed
│   ├── index.html                # "Today" page: structure + plain-words explainer copy
│   ├── app.js                    # "Today" page logic: hero, podium, ranked table, filters
│   ├── real.html                 # "Real Growth" page: buyers vs new coins
│   ├── real.js                   # "Real Growth" page logic
│   ├── common.js                 # shared: formatting, sparklines, score pills, tooltips, theme, date picker, nav
│   ├── score.js                  # THE Real Growth Score formula (also imported by the pipeline)
│   ├── styles.css                # design tokens (light/dark), layout, responsive rules (both pages)
│   ├── favicon.svg
│   └── data/                     # GENERATED; committed daily by the bot. Don't hand-edit.
│       ├── latest.json
│       ├── index.json
│       └── history/YYYY-MM-DD.json
├── scripts/
│   ├── build-data.mjs            # the daily data pipeline
│   └── serve.mjs                 # tiny local static server (npm run dev)
├── package.json                  # just two scripts; no dependencies
├── README.md                     # short public-facing overview + setup
└── HANDOVER.md                   # this file
```

---

## 5. The data pipeline in detail (`scripts/build-data.mjs`)

### Settings (top of the file)

| Constant | Default | Meaning |
|---|---|---|
| `MIN_CAP` | `15_000_000` | Lower market-cap bound (USD) |
| `MAX_CAP` | `2_000_000_000` | Upper market-cap bound (USD) |
| `HISTORY_DAYS` | `365` | Daily snapshots kept; older ones are deleted |
| `SUPPLY_FLAG_PTS` | `3` | Legacy `supplyDriven` flag (gap in % points between mcap and price change). The UI now uses the Real Growth Score. |
| `SUPPLY_NOISE` (in `public/score.js`) | `0.01` | Supply changes under 1% are treated as data noise, not a supply event |
| `SPARK_POINTS` | `42` | 7-day price-line resolution (downsampled from 168 hourly points) |
| `EXCLUDE` | set of symbols | Stablecoins, fiat tokens, wrapped/staked copies |
| `EXCLUDE_NAME` | regex | Tokenized stocks/ETFs (by coin name) |

### Environment variables

| Variable | Required? | Purpose |
|---|---|---|
| `COINGECKO_API_KEY` | Recommended | Free CoinGecko **Demo** key. Without it, requests are throttled (HTTP 429). The script retries automatically, but runs are slower (about 5 min) and less reliable on GitHub's shared IPs. |
| `COINGECKO_PRO` | No | Set to `1` only if you upgrade to a paid Pro key (switches base URL and header). |
| `ASCENT_DATA_DIR` | No | Write output to a different folder. Use it to test the pipeline without touching the published data. |

### Rate limiting and retries
- Gap between CoinGecko calls: 2.2s with a key, 6.5s without.
- On HTTP 429 or 5xx it waits (honours `Retry-After`, otherwise 15s → 90s backoff) and retries up to 6 times.
- **Safety check:** if fewer than 20 coins pass the filter, the script **fails on purpose** instead of publishing a broken dataset. The site keeps showing the previous day.

### How each number is calculated
- `cap` = CoinGecko `market_cap` (now)
- `capDelta` = CoinGecko `market_cap_change_24h`
- `capPrev` = `cap − capDelta` (market cap 24h ago)
- `capPct` = CoinGecko `market_cap_change_percentage_24h`, **the ranking key**
- `supplyGap` = `capPct − pricePct`; `supplyDriven` = `|supplyGap| ≥ 3` (legacy)

### Real Growth Score (`public/score.js` → `realGrowth()`)
Market cap = price × coins in circulation, so: **(1 + capChange) = (1 + priceChange) × (1 + supplyChange)**.
- `supplyPct` = (1 + capPct/100) ÷ (1 + pricePct/100) − 1, the change in the number of coins
- `priceDelta` = `capPrev × pricePct/100`: the dollars buyers added (what the market cap would have done with no new coins)
- `supplyDelta` = `capDelta − priceDelta`: the dollars added by new coins
- `score` = 100 × ln(1 + price) ÷ ln(1 + cap), clamped 0–100. Log shares add up exactly.
  - supply change ≤ 1% → 100 (noise); price ≤ 0 with real supply growth → 0
  - only for coins that grew; shrinking coins get `score: null`
- `verdict`: `real` (90–100), `mixed` (50–89), `supply` (0–49), `pricefell` (price dropped, value rose only from new coins), `shrank`, `flat` (too small to judge)
- `realPct` = min(capPct, pricePct): growth buyers can take credit for (used by the "Biggest real growth" sort)
- `summary.real` (`realSummary()`): `{ grew, total, fromPrice, fromSupply, realShare, counts }` across coins that grew

Worked example (9 Oct, OpenLedger): value +379.8%, price +3.4% → supply +364% → buyers added about $0.8M, new coins about $84.9M → **score 2**.
- `tier` = `small` (< $100M), `mid` ($100M–$500M), `large` ($500M–$2B)

### Output schema (`public/data/latest.json`)

```jsonc
{
  "version": 1,
  "date": "2026-10-09",                    // UTC date of the run
  "generatedAt": "2026-10-09T19:00:38Z",
  "filters": { "minCap": 15000000, "maxCap": 2000000000, "exchange": "Binance (spot)", "window": "24h" },
  "stats": { "binanceCoins": 507, "mapped": 506 },
  "summary": {
    "universe": 306, "up": 271, "down": 35, "flat": 0,
    "median": 3.3, "netDelta": 1920000000,
    "topId": "magic",                       // biggest climber whose growth is real or mixed (score ≥ 50)
    "real": { "grew": 271, "total": 2170000000, "fromPrice": 2070000000, "fromSupply": 96200000, "realShare": 96, "counts": { "real": 265, "mixed": 2, "supply": 3, "pricefell": 1 } },
    "bottomId": "...",
    "tiers": { "small": {...}, "mid": {...}, "large": {...} },
    "briefing": ["plain-English sentence", "..."]
  },
  "coins": [
    {
      "pos": 1, "id": "openledger-2", "symbol": "OPEN", "name": "OpenLedger", "image": "https://…",
      "tier": "mid", "cap": 107890252, "capPrev": 22563948, "capDelta": 85326304, "capPct": 378.15,
      "price": 0.108, "pricePct": 3.42, "price7dPct": -5.1, "volume": 12345678, "rank": 410,
      "supplyDriven": true, "supplyGap": 374.74,
      "score": 2, "verdict": "supply", "supplyPct": 364.1, "priceDelta": 762000, "supplyDelta": 84564000, "realPct": 3.42,
      "spark": [/* 42 prices over 7 days */],
      "updated": "…", "binance": "https://www.binance.com/en/trade/OPEN_USDT?type=spot"
    }
  ]
}
```

`index.json` = `{ latest, days: [{ date, generatedAt, universe, up, top: { symbol, capPct } }] }` (drives the date picker).

---

## 6. The website (`public/`)

**Design direction:** editorial and calm, like a financial newspaper rather than a neon crypto template. Serif headlines (*Instrument Serif*), clean sans for everything else (*Instrument Sans*), warm paper background in light mode, deep ink in dark mode. Green = grew, red = shrank, **always with ▲/▼ and a +/− sign**, so colour is never the only signal.

Every page shares the header (brand, **Today / Real Growth** navigation, date picker, light/dark toggle). The chosen day (`?date=YYYY-MM-DD`) carries across pages. Under the date, a line states the exact comparison window in the visitor's own time zone (e.g. "Comparing 10:43 on 10 Oct with 10:43 the day before (GMT+5)").

**Today page (`index.html` + `app.js`), top to bottom:**
1. **Hero**: big headline ("Treasure led the climb, up 130.8% in a single day") + plain-English briefing; a warning appears if the data is more than 30h old.
2. **Market mood card**: % of coins that grew, grew/shrank bar, coins tracked, typical (median) change, total value added, and a "95% of today's growth came from real buyers → Real Growth" link.
3. **Top three climbers**: yesterday-vs-today bars + 7-day price line + score pill. Excludes coins whose growth is mostly new coins.
4. **"How this works, in plain words"**: 3 numbered steps + a definition of market cap.
5. **Every coin, ranked**: search, size filter, direction, **"Real growth only"** toggle, sort (incl. **"Biggest real growth"**). Each coin shows a score pill. Clicking a row opens a one-sentence explanation, a **buyers vs new coins** split bar, and Binance/CoinGecko links. Shows 50 at a time.
6. **Footer**: method, sources, "not financial advice".

**Real Growth page (`real.html` + `real.js`), top to bottom:**
1. **Hero**: "95% of today's growth was real." + where the dollars came from + the day's biggest warning.
2. **Split card**: total value added, buyers vs new coins bar, count of Real / Mixed / New coins / Price fell.
3. **"What is the Real Growth Score?"**: bakery analogy (pricier loaves vs more loaves), the formula in one line, and the four score bands.
4. **"Growth that didn't come from buyers"**: one card per flagged coin: value vs price vs number-of-coins change, split bar, plain sentence.
5. **"The strongest real growth"**: top 10 climbers whose growth is real.

**Responsive:** desktop shows the full table; under 1100px the sparkline column hides; under 760px each row becomes a compact card.

**Where to change things:**
- Colours/fonts → CSS variables at the top of `styles.css` (light, plus dark in **two** places: the media query *and* `[data-theme="dark"]`. Keep them in sync.)
- Wording of the explainer → `index.html`
- Wording of the daily briefing → `summarise()` in `scripts/build-data.mjs`
- Wording of row explanations → `rowHTML()` in `public/app.js`
- Score formula, bands and noise threshold → `public/score.js` (change it **only** there; the pipeline imports it)
- Score wording (pills, sentences) → `scorePill()` / `realSentence()` in `public/common.js`
- Adding a new page: copy `real.html` (header + nav + footer), create `newpage.js` importing from `common.js`, call `initChrome({ onDate, generatedAt })`, and add a `<a data-href="newpage.html">` link to the `.nav` in **every** page
- Brand name "Ascent" → `index.html` + `real.html` (title, header, footer), `README.md`, page titles in `app.js` / `real.js`

---

## 7. Running it locally

Requires **Node.js 18+** (developed on Node 24). No `npm install` needed.

```bash
npm run data    # fetch live data → public/data/  (2–6 min without an API key)
npm run dev     # serve the site at http://localhost:5173
```

PowerShell users who want to use an API key locally:

```powershell
$env:COINGECKO_API_KEY = "your-demo-key"; npm run data
```

---

## 8. GitHub Actions (`.github/workflows/daily.yml`)

| Trigger | What happens |
|---|---|
| **Schedule** `5 0 * * *` (00:05 UTC daily) | Fetch data → commit → deploy |
| **Manual** (Actions tab → *Daily update* → **Run workflow**) | Fetch data → commit → deploy |
| **Push to `main`** (except changes only to `public/data/**` or `README.md`) | Deploy the site only (no fetch) |

- Commits made by the workflow use `GITHUB_TOKEN`, which **doesn't** re-trigger workflows, so there's no infinite loop.
- `concurrency: daily-update` stops two runs overlapping.
- Timeout: 20 minutes.

### One-time repository setup (needs the repo owner)

1. **Settings → Pages → Build and deployment → Source: `GitHub Actions`.** Without this, the deploy step fails.
2. **Settings → Actions → General → Workflow permissions: "Read and write permissions".** Needed so the bot can commit data.
3. *(Recommended)* **Settings → Secrets and variables → Actions → New repository secret**
   - Name: `COINGECKO_API_KEY`
   - Value: a free Demo key from https://www.coingecko.com/en/developers/dashboard
4. **Actions → Daily update → Run workflow** to get fresh data immediately.

### Changing the daily time
Edit the cron line. Times are **UTC** (UK is UTC+0 in winter, UTC+1 in summer). Example for 07:00 UK winter time: `0 7 * * *`. Use https://crontab.guru to check.

---

## 9. Known issues and gotchas

- **CoinGecko 429s without a key**: expected; handled by retries. Add the secret to make runs fast and reliable.
- **Scheduled runs can start 5–30 min late** when GitHub is busy. This is normal.
- **GitHub disables schedules after 60 days with no repo activity.** The daily data commit counts as activity, but if runs fail for a long time, re-enable the workflow in the Actions tab.
- **Never call `api.binance.com` from Actions.** It's geo-blocked (HTTP 451) for US runners. Keep `data-api.binance.vision`.
- **Supply revisions** (like OpenLedger +380% on 2026-10-09) happen regularly. That's what the Real Growth Score is for. Don't remove it; it's the dashboard's credibility feature.
- **Line endings:** the repo uses LF (`.gitattributes`). On Windows run `git config core.autocrlf false` in your clone so scripts aren't rewritten with CRLF.
- **Test the pipeline without overwriting published data:** `ASCENT_DATA_DIR=/tmp/ascent-test node scripts/build-data.mjs`.
- **New stablecoins / tokenized assets** may appear over time. Add their symbols to `EXCLUDE` or extend `EXCLUDE_NAME`.
- **Pages URL is case-sensitive** and lives under `/altcoin/`, so all asset paths in the site are **relative** (no leading `/`). Keep them that way.
- **Moving to Vercel (optional):** import the repo, Framework preset "Other", Output Directory `public`, no build command. The Action still commits data and Vercel redeploys on each commit. Remember that the Hobby plan is non-commercial.

---

## 10. Ideas / roadmap

- AI-written daily briefing (e.g. the Claude API) to replace the rule-based sentences. Needs a paid API key stored as a secret.
- "Streaks": coins that have been in the top 20 for several days in a row (history is already stored).
- Per-coin history page (market cap over the last 30 runs).
- Email/Telegram daily digest of the top 5.
- Custom domain on GitHub Pages (Settings → Pages → Custom domain).
- Swap the placeholder brand name "Ascent" for the final product name.

---

## 11. Change log

| Date | Change |
|---|---|
| 2026-10-09 | Project created: data pipeline, dashboard, daily workflow, README. First live run: 507 Binance coins → 306 in range. |
| 2026-10-09 | Added "New supply" detection (OpenLedger +380% vs price +3.4%), excluded tokenized stocks, headline/podium use genuine climbers only, "Hide supply jumps" filter. |
| 2026-10-10 | Pushed to GitHub (`hassankhan2510/altcoin`), added this handover document. Enabled GitHub Pages; first scheduled run committed data at 05:41 UTC. |
| 2026-10-10 | **Real Growth Score** (`public/score.js`) shared by pipeline and site; new **Real Growth** page; top navigation; score pills, split bars, "Real growth only" filter and "Biggest real growth" sort on Today; exact comparison window shown in the visitor's time zone; code split into `common.js`; `.gitattributes` (LF). |

---

*For information only. This product does not give financial advice.*
