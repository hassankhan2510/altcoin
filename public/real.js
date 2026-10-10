// Ascent — "Real Growth" page: how much of today's growth came from buyers vs new coins.
import {
  $, TIERS, esc, usd, pct, dirClass, longDate, shortDate, localTime, logo, scorePill, splitBar,
  realSentence, loadSnapshot, initChrome, windowLabel,
} from "./common.js";

const state = { data: null };

async function load(date, index) {
  $("#app").classList.add("is-loading");
  try {
    state.data = await loadSnapshot(date, index);
    state.isLatest = !index || state.data.date === index.latest;
    render();
  } catch (err) {
    console.error(err);
    $("#headline").textContent = "We couldn't load today's numbers.";
    $("#briefing").innerHTML = `<p>The daily update may still be running. Please refresh in a few minutes.</p>`;
  } finally {
    $("#app").classList.remove("is-loading");
    $("#app").setAttribute("aria-busy", "false");
  }
}

function render() {
  const { data } = state;
  const r = data.summary.real;
  const day = state.isLatest ? "today" : "that day";
  const grew = data.coins.filter((c) => c.score != null);
  const flagged = grew.filter((c) => c.verdict !== "real").sort((a, b) => b.supplyDelta - a.supplyDelta);
  const worst = flagged.find((c) => c.verdict === "supply" || c.verdict === "pricefell");

  $("#eyebrowText").textContent = `${longDate(data.date)} · Real Growth`;
  $("#window").textContent = windowLabel(data.generatedAt);
  document.title = `Real Growth ${r.realShare ?? "—"}% · ${shortDate(data.date)} — Ascent`;
  $(".pulse").classList.toggle("is-stale", !state.isLatest);
  $("#footMeta").textContent = `Updated ${localTime(data.generatedAt)}. Coin list from Binance public market data, market caps from CoinGecko.`;

  // Hero
  $("#headline").innerHTML = r.realShare == null
    ? "No coin in this range grew today."
    : `<em>${r.realShare}%</em> of ${state.isLatest ? "today's" : "that day's"} growth was real.`;
  const lines = [
    `The ${r.grew} coins that grew added <strong>${usd(r.total)}</strong> in value. <strong>${usd(r.fromPrice)}</strong> of that came from buyers paying higher prices, and <strong>${usd(r.fromSupply)}</strong> came from new coins being released.`,
  ];
  if (worst) {
    lines.push(`The biggest warning ${day} is <strong>${esc(worst.name)}</strong>: its value grew <strong>${pct(worst.capPct)}</strong>, but the price ${worst.pricePct > 0 ? `rose only <strong>${pct(worst.pricePct)}</strong>` : `actually fell <strong>${pct(worst.pricePct)}</strong>`}.`);
  } else {
    lines.push(`Good news: no coin ${day} grew mainly because of new coins.`);
  }
  $("#briefing").innerHTML = lines.map((l) => `<p>${l}</p>`).join("");

  // Split card
  $("#rgTotal").textContent = usd(r.total);
  $("#rgSplit").innerHTML = splitBar(r.fromPrice, r.fromSupply, { big: true });
  const c = r.counts;
  $("#rgCounts").innerHTML = `
    <li><span class="score score--real">✓ Real</span><b>${c.real}</b></li>
    <li><span class="score score--mixed">Mixed</span><b>${c.mixed}</b></li>
    <li><span class="score score--supply">⚠ New coins</span><b>${c.supply}</b></li>
    <li><span class="score score--pricefell">⚠ Price fell</span><b>${c.pricefell}</b></li>`;

  // Flagged coins
  $("#flags").innerHTML = flagged.length
    ? flagged.map(flagCard).join("")
    : `<div class="card empty">Every coin that grew today did so because of buyers. Nothing to flag.</div>`;

  // Strongest real growth
  const real = grew.filter((x) => x.verdict === "real").sort((a, b) => b.capPct - a.capPct).slice(0, 10);
  $("#realRows").innerHTML = real.map((x, i) => `
    <div class="rlist__row" role="row">
      <span class="c-pos" role="cell">${i + 1}</span>
      <span class="c-coin" role="cell">${logo(x, "logo--sm")}<span class="c-coin__txt"><strong>${esc(x.name)}</strong><span>${esc(x.symbol)} · ${TIERS[x.tier].label}</span></span></span>
      <span class="rlist__num ${dirClass(x.capPct)}" role="cell"><b>${pct(x.capPct)}</b></span>
      <span class="rlist__num ${dirClass(x.pricePct)}" role="cell">${pct(x.pricePct)}</span>
      <span role="cell">${scorePill(x)}</span>
    </div>`).join("") || `<div class="empty">No coin grew mainly from buyers today.</div>`;
}

function flagCard(c) {
  return `<article class="flag card">
    <div class="flag__top">
      ${logo(c)}
      <div class="flag__name"><strong>${esc(c.name)}</strong><span>${esc(c.symbol)} · ${TIERS[c.tier].label} coin · ${usd(c.capPrev)} → ${usd(c.cap)}</span></div>
      ${scorePill(c)}
    </div>
    <div class="flag__nums">
      <div>Total value<b class="${dirClass(c.capPct)}">${pct(c.capPct)}</b></div>
      <div>Price<b class="${dirClass(c.pricePct)}">${pct(c.pricePct)}</b></div>
      <div>Number of coins<b>${pct(c.supplyPct)}</b></div>
    </div>
    ${splitBar(c.priceDelta, c.supplyDelta)}
    <p>${realSentence(c)}</p>
    <div class="flag__foot">
      <a class="btn" href="${esc(c.binance)}" target="_blank" rel="noopener">Binance ↗</a>
      <a class="btn" href="https://www.coingecko.com/en/coins/${encodeURIComponent(c.id)}" target="_blank" rel="noopener">CoinGecko ↗</a>
    </div>
  </article>`;
}

initChrome({ onDate: load, generatedAt: () => state.data?.generatedAt });
