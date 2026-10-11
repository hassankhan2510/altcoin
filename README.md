# Ascent: Daily Market-Cap Climbers

Every day, Ascent looks at every coin trading on **Binance**, keeps the ones with a market cap between **$15M and $2B**, and ranks them by how much their **market cap grew in percent over the last 24 hours**.

> A $20M coin that gains $10M (**+50%**) ranks above a $100M coin that gains the same $10M (**+10%**).

Everything runs on free tiers: **GitHub Actions** fetches the data once a day, and **GitHub Pages** hosts the dashboard. There are no servers, databases or paid APIs.

---

## How it works

```
GitHub Actions (00:05 UTC = 5:05 AM Pakistan time: daily + live; then every 4 hours: live only)
  └─ scripts/build-data.mjs
       1. Binance public data  → which coins are trading right now
       2. CoinGecko tickers    → exact CoinGecko ID for each Binance coin
       3. CoinGecko markets    → market cap, 24h market-cap change, price, 7-day price line
       4. Filter $15M–$2B, drop stablecoins/wrapped tokens, rank by 24h market-cap %
       5. Write public/data/latest.json + history/YYYY-MM-DD.json + index.json
  └─ commit the data → deploy public/ to GitHub Pages
```

* **Why market-cap % and not price %?** Market cap = price × coins in circulation. When the two differ by more than 3 points, the coin gets a **New supply** tag, which usually means a token unlock. This tag is a useful early warning.
* **Why `data-api.binance.vision`?** `api.binance.com` blocks US-based servers, and GitHub's runners are in the US. The `data-api` mirror is Binance's official public market-data endpoint and isn't blocked.
* **History:** the last 30 daily snapshots are kept on main. The **Live page** (`live.html`) refreshes every 4 hours and keeps the last 3 days of snapshots on the `live-data` branch.

## Project layout

| Path | What it is |
|---|---|
| `public/` | The website (plain HTML/CSS/JS, no build step) |
| `public/data/` | Generated data (committed by the bot daily) |
| `scripts/build-data.mjs` | The daily data job (Node 18+, zero dependencies) |
| `scripts/serve.mjs` | Local preview server |
| `.github/workflows/daily.yml` | Schedule + deploy |

## Run it locally

```bash
npm run data   # fetch today's data (2–5 minutes without an API key)
npm run dev    # open http://localhost:5173
```

## Put it online (free, about 10 minutes)

1. **Create a GitHub repo** and push this folder to the `main` branch.
2. **Turn on Pages:** go to Settings → Pages → *Build and deployment* → Source: **GitHub Actions**.
3. **(Recommended) Add a free CoinGecko Demo key.** Without one, CoinGecko rate-limits shared GitHub servers and the run is slower and less reliable.
   * Sign up at coingecko.com/en/developers/dashboard and create a **Demo** key (free).
   * In the repo, go to Settings → Secrets and variables → Actions → *New repository secret*, with name `COINGECKO_API_KEY`.
4. **First run:** open Actions → *Daily update* → **Run workflow**. Your site will be at `https://<user>.github.io/<repo>/`.

From then on it updates itself every day.

### Changing the settings

* **Run time:** edit the `cron` line in `.github/workflows/daily.yml` (times are UTC).
* **Market-cap range:** edit `MIN_CAP` / `MAX_CAP` at the top of `scripts/build-data.mjs`.
* **Excluded coins:** the `EXCLUDE` list in the same file.

### Notes on the free tiers

* GitHub may start scheduled runs a few minutes late at busy times. That's normal.
* GitHub pauses schedules in repos with **no activity for 60 days**. The daily data commit counts as activity, but if a run ever fails for a long stretch, re-enable it from the Actions tab.
* **Vercel instead of Pages?** That works too: import the repo, set the output directory to `public`, and leave the build command empty. The Action still commits data daily and Vercel redeploys on every commit. Note that Vercel's free *Hobby* plan is for **non-commercial** use only.

---

New developer? Start with **[HANDOVER.md](HANDOVER.md)**.

*For information only. This is not financial advice.*
