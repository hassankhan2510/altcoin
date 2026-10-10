// Ascent — "Today" page. Reads data/*.json produced by scripts/build-data.mjs.
import {
  $, TIERS, esc, usd, price, pct, dirClass, arrow, longDate, shortDate, ago, localTime, hilite,
  logo, spark, sparkUp, scorePill, splitBar, realSentence, loadSnapshot, initChrome, windowLabel,
} from "./common.js";

const PAGE = 50;
const state = { data: null, q: "", tier: "all", dir: "all", sort: "pct", realOnly: false, limit: PAGE, open: new Set() };
const isSupplyDriven = (c) => c.verdict === "supply" || c.verdict === "pricefell";

async function load(date, index) {
  $("#app").classList.add("is-loading");
  try {
    state.data = await loadSnapshot(date, index);
    state.isLatest = !index || state.data.date === index.latest;
    state.limit = PAGE;
    state.open.clear();
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
  renderHero();
  renderMood();
  renderPodium();
  renderFilters();
  renderBoard();
}

function renderHero() {
  const { data } = state;
  const s = data.summary;
  const top = data.coins.find((c) => c.id === s.topId) ?? data.coins[0];
  $("#eyebrowText").textContent = `${longDate(data.date)} · ${state.isLatest ? "Today's briefing" : "Past briefing"}`;
  $("#window").textContent = windowLabel(data.generatedAt);
  document.title = `Ascent — ${top.symbol} ${pct(top.capPct)} · ${shortDate(data.date)}`;

  $("#headline").innerHTML = top.capPct > 0
    ? `<img class="logo-inline" src="${esc(top.image)}" alt="">${esc(top.name)} led the climb, <em>up&nbsp;${pct(top.capPct).slice(1)}</em> in a single day.`
    : `A quiet day. Even the best coin, ${esc(top.name)}, moved only ${pct(top.capPct)}.`;
  $("#briefing").innerHTML = s.briefing.map((t) => `<p>${hilite(t)}</p>`).join("");

  const fresh = $("#freshness");
  const pulse = $(".pulse");
  const hours = (Date.now() - new Date(data.generatedAt).getTime()) / 36e5;
  fresh.hidden = !(state.isLatest && hours > 30);
  if (!fresh.hidden) fresh.textContent = `Heads up: these numbers are from ${ago(data.generatedAt)}. Today's update hasn't arrived yet.`;
  pulse.classList.toggle("is-stale", !fresh.hidden || !state.isLatest);
  $("#footMeta").textContent = `Updated ${localTime(data.generatedAt)}. Coin list from Binance public market data, market caps from CoinGecko.`;
}

function renderMood() {
  const s = state.data.summary;
  const total = Math.max(1, s.universe);
  $("#moodPct").textContent = `${Math.round((s.up / total) * 100)}%`;
  const seg = (cls, n, word) => n ? `<span class="${cls}" style="flex-grow:${n}" data-tip="<b>${n} coins</b> ${word}"></span>` : "";
  $("#moodBar").innerHTML = seg("m-up", s.up, "grew") + seg("m-flat", s.flat, "stayed flat") + seg("m-down", s.down, "shrank");
  $("#moodBar").setAttribute("aria-label", `${s.up} coins grew, ${s.flat} stayed flat, ${s.down} shrank`);
  $("#moodLegend").innerHTML = `
    <li><i style="background:var(--up-fill)"></i>Grew <b>${s.up}</b></li>
    ${s.flat ? `<li><i style="background:var(--flat-fill)"></i>Flat <b>${s.flat}</b></li>` : ""}
    <li><i style="background:var(--down-fill)"></i>Shrank <b>${s.down}</b></li>`;
  $("#miniStats").innerHTML = `
    <div><dt>Coins tracked</dt><dd>${s.universe}</dd></div>
    <div><dt>Typical change</dt><dd class="${dirClass(s.median)}">${pct(s.median)}</dd></div>
    <div><dt>Value added, all coins</dt><dd class="${dirClass(s.netDelta)}">${usd(s.netDelta, { sign: true })}</dd></div>`;
  const r = s.real;
  const link = $("#realLink");
  link.hidden = r?.realShare == null;
  if (!link.hidden) link.innerHTML = `<span><b>${r.realShare}%</b> of today's growth came from real buyers</span><span class="mood__go">Real Growth →</span>`;
}

function compareBars(c) {
  const max = Math.max(c.cap, c.capPrev);
  return `<div class="compare" role="img" aria-label="Total value went from ${usd(c.capPrev)} yesterday to ${usd(c.cap)} today">
    <div class="compare__row"><span>Yesterday</span><div class="compare__track"><div class="compare__fill compare__fill--before" style="width:${(c.capPrev / max) * 100}%"></div></div><b>${usd(c.capPrev)}</b></div>
    <div class="compare__row"><span>Today</span><div class="compare__track"><div class="compare__fill compare__fill--after" style="width:${(c.cap / max) * 100}%"></div></div><b>${usd(c.cap)}</b></div>
  </div>`;
}

function renderPodium() {
  // Podium shows climbers whose growth is mostly real; supply-driven jumps stay in the full list.
  const top = state.data.coins.filter((c) => c.capPct > 0 && !isSupplyDriven(c)).slice(0, 3);
  if (!top.length) {
    $("#podium").innerHTML = `<div class="card empty">No coin in this range grew today.</div>`;
    return;
  }
  $("#podium").innerHTML = top.map((c, i) => `
    <article class="pod card pod--${i + 1}">
      <div class="pod__top">
        <span class="pod__place" aria-label="Place ${i + 1}">${i + 1}</span>
        ${logo(c)}
        <div class="pod__name"><strong>${esc(c.name)}</strong><span>${esc(c.symbol)}</span></div>
        <div class="pod__pct"><b>${pct(c.capPct)}</b><small>${usd(c.capDelta, { sign: true })} in 24h</small></div>
      </div>
      ${compareBars(c)}
      <div class="pod__spark">
        <div class="pod__spark-label"><span>Price, last 7 days</span><span class="${dirClass(c.price7dPct)}">${pct(c.price7dPct)}</span></div>
        ${spark(c.spark, sparkUp(c), { h: 56 })}
      </div>
      <div class="pod__foot"><span class="badge badge--${c.tier}">${TIERS[c.tier].label} coin</span>${scorePill(c)}<a href="${esc(c.binance)}" target="_blank" rel="noopener">Binance ↗</a></div>
    </article>`).join("");
}

function segButtons(el, items, current, key) {
  el.innerHTML = items.map((it) => `<button type="button" role="radio" aria-checked="${it.value === current}" data-${key}="${it.value}"${it.tip ? ` data-tip="${esc(it.tip)}"` : ""}>${it.label}${it.count != null ? `<small>${it.count}</small>` : ""}</button>`).join("");
}

function renderFilters() {
  const all = state.data.coins;
  const n = (t) => all.filter((c) => c.tier === t).length;
  const ns = all.filter(isSupplyDriven).length;
  $("#supplyBtn").hidden = !ns;
  $("#supplyCount").textContent = ns;
  segButtons($("#tierSeg"), [
    { value: "all", label: "All sizes", count: all.length },
    ...Object.entries(TIERS).map(([value, t]) => ({ value, label: t.label, count: n(value), tip: `${t.label} coins: worth ${t.range}` })),
  ], state.tier, "tier");
  segButtons($("#dirSeg"), [
    { value: "all", label: "All" },
    { value: "up", label: "▲ Growing" },
    { value: "down", label: "▼ Shrinking" },
  ], state.dir, "dir");
}

function filtered() {
  const q = state.q.trim().toLowerCase();
  const list = state.data.coins.filter((c) =>
    (state.tier === "all" || c.tier === state.tier) &&
    (!state.realOnly || !isSupplyDriven(c)) &&
    (state.dir === "all" || (state.dir === "up" ? c.capPct > 0 : c.capPct < 0)) &&
    (!q || c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q)));
  const sorters = {
    pct: (a, b) => b.capPct - a.capPct,
    real: (a, b) => (b.realPct ?? -Infinity) - (a.realPct ?? -Infinity),
    "pct-asc": (a, b) => a.capPct - b.capPct,
    delta: (a, b) => b.capDelta - a.capDelta,
    cap: (a, b) => b.cap - a.cap,
  };
  return list.sort(sorters[state.sort]);
}

function barScale(list) {
  // Scale to the biggest real mover; supply-driven outliers (e.g. +380%) get a clipped bar instead of flattening the rest.
  return Math.max(5, ...list.filter((c) => !isSupplyDriven(c) && !c.supplyDriven).map((c) => Math.abs(c.capPct)));
}

function rowHTML(c, scale) {
  const w = Math.min(1, Math.abs(c.capPct) / scale) * 50;
  const clipped = Math.abs(c.capPct) > scale;
  const fill = c.capPct === 0 ? "" : `<span class="dbar__fill dbar__fill--${c.capPct > 0 ? "up" : "down"}${clipped ? " is-clipped" : ""}" style="width:calc(${w}% - 1px)"></span>`;
  const open = state.open.has(c.id);
  const verb = c.capPct >= 0 ? "more" : "less";
  const shrinkNote = c.capPct < 0 && Math.abs(c.supplyPct ?? 0) >= 3
    ? ` <strong>Note:</strong> the price moved <strong>${pct(c.pricePct)}</strong>, so part of this drop came from the number of coins changing (coins removed, or the supply figure corrected).`
    : c.capPct < 0 && c.pricePct != null ? ` The price of one coin moved <strong>${pct(c.pricePct)}</strong>.` : "";
  return `<div class="item${open ? " is-open" : ""}" role="row" data-id="${esc(c.id)}">
    <button class="row" type="button" aria-expanded="${open}" aria-controls="d-${esc(c.id)}">
      <span class="c-pos" role="cell">${c.pos}</span>
      <span class="c-coin" role="cell">${logo(c, "logo--sm")}<span class="c-coin__txt"><strong>${esc(c.name)}</strong><span>${esc(c.symbol)} · ${TIERS[c.tier].label}${scorePill(c)}</span></span></span>
      <span class="c-val" role="cell">${usd(c.capPrev)}<span class="arrow">→</span><b>${usd(c.cap)}</b></span>
      <span class="c-chg ${dirClass(c.capPct)}" role="cell"><b>${arrow(c.capPct)} ${pct(c.capPct)}</b><small>${usd(c.capDelta, { sign: true })}</small></span>
      <span class="c-bar" role="cell"><span class="dbar" data-tip="<b>${pct(c.capPct)}</b> · ${usd(c.capDelta, { sign: true })} in 24h">${fill}</span></span>
      <span class="c-spark" role="cell">${spark(c.spark, sparkUp(c))}</span>
      <span class="c-price" role="cell">${price(c.price)}<small class="${dirClass(c.pricePct)}">${pct(c.pricePct)}</small></span>
    </button>
    <div class="detail" id="d-${esc(c.id)}">
      <p>Yesterday, all the ${esc(c.symbol)} coins in circulation were worth <strong>${usd(c.capPrev)}</strong> together. Today they're worth <strong>${usd(c.cap)}</strong>. That's <strong>${usd(Math.abs(c.capDelta))} ${verb}</strong>, a change of <strong class="${dirClass(c.capPct)}">${pct(c.capPct)}</strong>.${shrinkNote}</p>
      ${c.score != null ? `<div class="detail__real">
        <p class="detail__real-head">Where the growth came from ${scorePill(c)}</p>
        ${splitBar(c.priceDelta, c.supplyDelta)}
        <p>${realSentence(c)}</p>
      </div>` : ""}
      <div class="detail__facts">
        <span>Price <b>${price(c.price)}</b></span>
        <span>Price over 7 days <b class="${dirClass(c.price7dPct)}">${pct(c.price7dPct)}</b></span>
        <span>Traded in 24h <b>${usd(c.volume)}</b></span>
        ${c.rank ? `<span>Global rank <b>#${c.rank}</b></span>` : ""}
        <span>Size group <b>${TIERS[c.tier].label} (${TIERS[c.tier].range})</b></span>
      </div>
      <div class="detail__links">
        <a class="btn btn--primary" href="${esc(c.binance)}" target="_blank" rel="noopener">Open on Binance ↗</a>
        <a class="btn" href="https://www.coingecko.com/en/coins/${encodeURIComponent(c.id)}" target="_blank" rel="noopener">CoinGecko ↗</a>
      </div>
    </div>
  </div>`;
}

function renderBoard() {
  const list = filtered();
  const scale = barScale(list);
  const shown = list.slice(0, state.limit);
  $("#rows").innerHTML = shown.length
    ? shown.map((c) => rowHTML(c, scale)).join("")
    : `<div class="empty">No coins match. Try a different search or size.</div>`;
  $("#count").textContent = `Showing ${shown.length} of ${list.length} coins${list.length !== state.data.coins.length ? ` (${state.data.coins.length} in total)` : ""}`;
  const more = $("#more");
  more.hidden = shown.length >= list.length;
  more.textContent = `Show ${Math.min(PAGE, list.length - shown.length)} more coins`;
}

// ── Events ────────────────────────────────────────────────────────────────────
$("#rows").addEventListener("click", (e) => {
  const btn = e.target.closest("button.row");
  if (!btn) return;
  const item = btn.closest(".item");
  const open = !state.open.has(item.dataset.id);
  open ? state.open.add(item.dataset.id) : state.open.delete(item.dataset.id);
  item.classList.toggle("is-open", open);
  btn.setAttribute("aria-expanded", open);
});
$("#tierSeg").addEventListener("click", (e) => {
  const b = e.target.closest("[data-tier]");
  if (!b) return;
  state.tier = b.dataset.tier; state.limit = PAGE;
  renderFilters(); renderBoard();
});
$("#dirSeg").addEventListener("click", (e) => {
  const b = e.target.closest("[data-dir]");
  if (!b) return;
  state.dir = b.dataset.dir; state.limit = PAGE;
  renderFilters(); renderBoard();
});
let qTimer;
$("#q").addEventListener("input", (e) => {
  clearTimeout(qTimer);
  qTimer = setTimeout(() => { state.q = e.target.value; state.limit = PAGE; renderBoard(); }, 120);
});
$("#supplyBtn").addEventListener("click", (e) => {
  state.realOnly = !state.realOnly; state.limit = PAGE;
  e.currentTarget.setAttribute("aria-pressed", state.realOnly);
  renderBoard();
});
$("#sort").addEventListener("change", (e) => { state.sort = e.target.value; renderBoard(); });
$("#more").addEventListener("click", () => { state.limit += PAGE; renderBoard(); });

initChrome({ onDate: load, generatedAt: () => state.data?.generatedAt });
