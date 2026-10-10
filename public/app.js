// Ascent dashboard — static, zero-dependency. Reads data/*.json produced by scripts/build-data.mjs.

const $ = (s, el = document) => el.querySelector(s);
const PAGE = 50;
const TIERS = {
  small: { label: "Small", range: "$15M–$100M" },
  mid: { label: "Mid", range: "$100M–$500M" },
  large: { label: "Large", range: "$500M–$2B" },
};

const state = { index: null, data: null, date: null, q: "", tier: "all", dir: "all", sort: "pct", hideSupply: false, limit: PAGE, open: new Set() };

// ── Formatting ────────────────────────────────────────────────────────────────
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const MINUS = "−";
function usd(n, { sign = false } = {}) {
  if (n == null) return "—";
  const a = Math.abs(n);
  const s = a >= 1e9 ? `${(a / 1e9).toFixed(2)}B` : a >= 1e6 ? `${(a / 1e6).toFixed(a >= 1e8 ? 0 : 1)}M` : a >= 1e3 ? `${(a / 1e3).toFixed(0)}K` : a.toFixed(0);
  const pre = n < 0 ? MINUS : sign ? "+" : "";
  return `${pre}$${s}`;
}
function price(p) {
  if (p == null) return "—";
  if (p >= 1000) return `$${p.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (p >= 1) return `$${p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 3 })}`;
  return `$${Number(p.toPrecision(4))}`;
}
const pct = (p, d = 1) => (p == null ? "—" : `${p > 0 ? "+" : p < 0 ? MINUS : ""}${Math.abs(p).toFixed(d)}%`);
const dirClass = (p) => (p > 0 ? "is-up" : p < 0 ? "is-down" : "");
const arrow = (p) => (p > 0 ? "▲" : p < 0 ? "▼" : "•");
// ── Time: every time is shown in Pakistan Standard Time (PKT = UTC+5, no daylight saving) ──
const TZ = "Asia/Karachi";
// Keep in sync with the cron line in .github/workflows/daily.yml (00:05 UTC = 5:05 AM PKT).
const SCHEDULE_UTC = { hour: 0, minute: 5 };
const fmt = (iso, opts) => new Date(iso).toLocaleString("en-GB", { timeZone: TZ, ...opts });
const pkTime = (iso) => fmt(iso, { hour: "numeric", minute: "2-digit", hour12: true }).toUpperCase(); // "10:43 AM"
const pkDay = (iso) => fmt(iso, { weekday: "short", day: "numeric", month: "short" }); // "Sat 10 Oct"
const pkLong = (iso) => fmt(iso, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const pkStamp = (iso) => `${pkDay(iso)}, ${pkTime(iso)}`;
const dayBefore = (iso) => new Date(new Date(iso).getTime() - 864e5).toISOString();
const sameClockAsPK = (iso) => {
  const o = { hour: "2-digit", minute: "2-digit", day: "numeric" };
  return fmt(iso, o) === new Date(iso).toLocaleString("en-GB", o);
};
const localStamp = (iso) => new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZoneName: "short" }).replace(/\b(am|pm)\b/, (m) => m.toUpperCase());

function ago(iso) {
  const h = (Date.now() - new Date(iso).getTime()) / 36e5;
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} minutes ago`;
  if (h < 48) return `${Math.round(h)} hour${Math.round(h) === 1 ? "" : "s"} ago`;
  return `${Math.round(h / 24)} days ago`;
}

/** When the next scheduled run should happen, or "late" if today's run is overdue. */
function nextUpdate(generatedAt) {
  const now = new Date();
  const slot = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), SCHEDULE_UTC.hour, SCHEDULE_UTC.minute));
  if (now >= slot && new Date(generatedAt) < slot) return { late: true, iso: slot.toISOString() };
  if (slot <= now) slot.setUTCDate(slot.getUTCDate() + 1);
  return { late: false, iso: slot.toISOString() };
}

function logo(c, size = "") {
  return `<img class="logo ${size}" src="${esc(c.image)}" alt="" loading="lazy" decoding="async" width="36" height="36" data-sym="${esc(c.symbol.slice(0, 3))}">`;
}
// Missing coin images degrade to a lettered disc.
document.addEventListener("error", (e) => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement) || !img.classList.contains("logo")) return;
  const d = document.createElement("span");
  d.className = `${img.className} logo--fallback`;
  d.textContent = img.dataset.sym || "?";
  d.setAttribute("aria-hidden", "true");
  img.replaceWith(d);
}, true);

// ── Sparkline (price, last 7 days) ────────────────────────────────────────────
function spark(values, up, { h = 34 } = {}) {
  if (!values?.length) return "";
  const w = 100, min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 3 - ((v - min) / span) * (h - 6)]);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`).join("");
  const cls = up ? "is-up" : "is-down";
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" data-spark='${JSON.stringify(values)}' role="img" aria-label="7-day price line, ${up ? "up" : "down"} overall">
    <path class="area ${cls}" d="${d}L${w} ${h}L0 ${h}Z"/>
    <path class="line ${cls}" d="${d}" vector-effect="non-scaling-stroke"/>
    <line class="cross" x1="0" x2="0" y1="0" y2="${h}" vector-effect="non-scaling-stroke" visibility="hidden"/>
  </svg>`;
}

// ── Tooltip (shared) ──────────────────────────────────────────────────────────
const tip = $("#tip");
function showTip(html, x, y) {
  tip.innerHTML = html;
  tip.hidden = false;
  const r = tip.getBoundingClientRect();
  const left = Math.min(window.innerWidth - r.width - 8, Math.max(8, x - r.width / 2));
  const top = y - r.height - 12 < 8 ? y + 18 : y - r.height - 12;
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}
const hideTip = () => (tip.hidden = true);

document.addEventListener("pointermove", (e) => {
  const sv = e.target.closest?.("svg.spark");
  document.querySelectorAll("svg.spark line.cross[visibility='visible']").forEach((l) => l.closest("svg") !== sv && l.setAttribute("visibility", "hidden"));
  if (sv) {
    const vals = JSON.parse(sv.dataset.spark);
    const r = sv.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const i = Math.round(t * (vals.length - 1));
    const x = (i / (vals.length - 1)) * 100;
    const line = sv.querySelector(".cross");
    line.setAttribute("x1", x); line.setAttribute("x2", x); line.setAttribute("visibility", "visible");
    const when = new Date(new Date(state.data.generatedAt).getTime() - (1 - i / (vals.length - 1)) * 7 * 864e5);
    const label = `${pkStamp(when.toISOString())} PKT`;
    return showTip(`<b>${price(vals[i])}</b><br>${label}`, e.clientX, r.top);
  }
  const t = e.target.closest?.("[data-tip]");
  if (t) return showTip(t.dataset.tip, e.clientX, t.getBoundingClientRect().top);
  hideTip();
});
document.addEventListener("pointerleave", hideTip);
window.addEventListener("scroll", hideTip, { passive: true });

// ── Data loading ──────────────────────────────────────────────────────────────
async function getJSON(url) {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

async function load(date) {
  $("#app").classList.add("is-loading");
  try {
    const isLatest = !date || date === state.index?.latest;
    state.data = await getJSON(isLatest ? "data/latest.json" : `data/history/${date}.json`);
    state.date = state.data.date;
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

// ── Render ────────────────────────────────────────────────────────────────────
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
  const isLatest = data.date === state.index?.latest || !state.index;
  $("#eyebrowText").textContent = `${pkLong(data.generatedAt)} · ${isLatest ? "Latest briefing" : "Past briefing"}`;
  renderWhen(data.generatedAt, isLatest);
  document.title = `Ascent — ${top.symbol} ${pct(top.capPct)} · ${pkDay(data.generatedAt)}`;

  $("#headline").innerHTML = top.capPct > 0
    ? `<img class="logo-inline" src="${esc(top.image)}" alt="">${esc(top.name)} led the climb, <em>up&nbsp;${pct(top.capPct).slice(1)}</em> in a single day.`
    : `A quiet day. Even the best coin, ${esc(top.name)}, moved only ${pct(top.capPct)}.`;

  const sentences = s.briefing.map((t) => `<p>${esc(t).replace(/(\$[\d.]+[KMB]|[+−-]?[\d.]+%)/g, "<strong>$1</strong>")}</p>`);
  $("#briefing").innerHTML = sentences.join("");

  const fresh = $("#freshness");
  const pulse = $(".pulse");
  const hours = (Date.now() - new Date(data.generatedAt).getTime()) / 36e5;
  if (isLatest && hours > 30) {
    fresh.hidden = false;
    fresh.textContent = `Heads up: these numbers are from ${ago(data.generatedAt)}. Today's update hasn't arrived yet.`;
    pulse.classList.add("is-stale");
  } else {
    fresh.hidden = true;
    pulse.classList.toggle("is-stale", !isLatest);
  }
  $("#footMeta").textContent = `Updated ${pkStamp(data.generatedAt)} PKT. Coin list from Binance public market data, market caps from CoinGecko.`;
}

/** The time box under the date: exact window, last update, next update — all in PKT. */
function renderWhen(gen, isLatest) {
  const next = nextUpdate(gen);
  const nextText = next.late
    ? `Running late, due since ${pkTime(next.iso)}`
    : `${pkDay(next.iso)}, around ${pkTime(next.iso)}`;
  const yours = sameClockAsPK(gen) ? "" : ` In your time zone, this update was ${localStamp(gen)}.`;
  $("#when").innerHTML = `
    <div><dt>Comparing</dt><dd>${pkStamp(dayBefore(gen))} → ${pkStamp(gen)}</dd></div>
    <div><dt>Updated</dt><dd>${pkStamp(gen)} <span>(${ago(gen)})</span></dd></div>
    ${isLatest ? `<div><dt>Next update</dt><dd>${nextText}</dd></div>` : ""}
    <p class="when__tz">All times are <strong>Pakistan Standard Time (PKT, UTC+5)</strong>.${yours}</p>`;
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
}

function compareBars(c) {
  const max = Math.max(c.cap, c.capPrev);
  return `<div class="compare" role="img" aria-label="Total value went from ${usd(c.capPrev)} on ${pkStamp(dayBefore(state.data.generatedAt))} to ${usd(c.cap)} on ${pkStamp(state.data.generatedAt)} Pakistan time">
    <div class="compare__row"><span>${pkDay(dayBefore(state.data.generatedAt)).split(" ")[0]} ${pkTime(dayBefore(state.data.generatedAt))}</span><div class="compare__track"><div class="compare__fill compare__fill--before" style="width:${(c.capPrev / max) * 100}%"></div></div><b>${usd(c.capPrev)}</b></div>
    <div class="compare__row"><span>${pkDay(state.data.generatedAt).split(" ")[0]} ${pkTime(state.data.generatedAt)}</span><div class="compare__track"><div class="compare__fill compare__fill--after" style="width:${(c.cap / max) * 100}%"></div></div><b>${usd(c.cap)}</b></div>
  </div>`;
}

function badges(c) {
  return `<span class="badge badge--${c.tier}">${TIERS[c.tier].label} coin</span>${c.supplyDriven ? `<span class="badge badge--supply" data-tip="Market cap moved ${pct(c.supplyGap)} more than the price. Usually means coins were added to (or removed from) circulation.">New supply</span>` : ""}`;
}

function renderPodium() {
  // Podium shows genuine climbers only; supply-driven jumps stay in the full list with a tag.
  const top = state.data.coins.filter((c) => c.capPct > 0 && !c.supplyDriven).slice(0, 3);
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
        ${spark(c.spark, (c.spark.at(-1) ?? 0) >= (c.spark[0] ?? 0), { h: 56 })}
      </div>
      <div class="pod__foot">${badges(c)}<a href="${esc(c.binance)}" target="_blank" rel="noopener">Binance ↗</a></div>
    </article>`).join("");
}

function counts() {
  const all = state.data.coins;
  const by = (t) => all.filter((c) => c.tier === t).length;
  return { all: all.length, small: by("small"), mid: by("mid"), large: by("large") };
}

function segButtons(el, items, current, key) {
  el.innerHTML = items.map((it) => `<button type="button" role="radio" aria-checked="${it.value === current}" data-${key}="${it.value}"${it.tip ? ` data-tip="${esc(it.tip)}"` : ""}>${it.label}${it.count != null ? `<small>${it.count}</small>` : ""}</button>`).join("");
}

function renderFilters() {
  const n = counts();
  const ns = state.data.coins.filter((c) => c.supplyDriven).length;
  $("#supplyBtn").hidden = !ns;
  $("#supplyCount").textContent = ns;
  segButtons($("#tierSeg"), [
    { value: "all", label: "All sizes", count: n.all },
    ...Object.entries(TIERS).map(([value, t]) => ({ value, label: t.label, count: n[value], tip: `${t.label} coins: worth ${t.range}` })),
  ], state.tier, "tier");
  segButtons($("#dirSeg"), [
    { value: "all", label: "All" },
    { value: "up", label: "▲ Growing" },
    { value: "down", label: "▼ Shrinking" },
  ], state.dir, "dir");
}

function filtered() {
  const q = state.q.trim().toLowerCase();
  let list = state.data.coins.filter((c) =>
    (state.tier === "all" || c.tier === state.tier) &&
    (!state.hideSupply || !c.supplyDriven) &&
    (state.dir === "all" || (state.dir === "up" ? c.capPct > 0 : c.capPct < 0)) &&
    (!q || c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q)));
  const sorters = {
    pct: (a, b) => b.capPct - a.capPct,
    "pct-asc": (a, b) => a.capPct - b.capPct,
    delta: (a, b) => b.capDelta - a.capDelta,
    cap: (a, b) => b.cap - a.cap,
  };
  return list.sort(sorters[state.sort]);
}

function barScale(list) {
  // Scale to the biggest genuine mover; supply-driven outliers (e.g. +380%) get a clipped bar instead of flattening the rest.
  const mags = list.filter((c) => !c.supplyDriven).map((c) => Math.abs(c.capPct));
  return Math.max(5, ...mags);
}

function rowHTML(c, scale) {
  const w = Math.min(1, Math.abs(c.capPct) / scale) * 50;
  const clipped = Math.abs(c.capPct) > scale;
  const fill = c.capPct === 0 ? "" : `<span class="dbar__fill dbar__fill--${c.capPct > 0 ? "up" : "down"}${clipped ? " is-clipped" : ""}" style="width:calc(${w}% - 1px)"></span>`;
  const open = state.open.has(c.id);
  const verb = c.capPct >= 0 ? "more" : "less";
  const priceLine = c.pricePct == null ? "" : ` The price of one coin moved <strong>${pct(c.pricePct)}</strong>.`;
  const supplyLine = !c.supplyDriven ? ""
    : c.supplyGap > 0 ? ` <strong>Note:</strong> the total value grew faster than the price, which usually means new coins were released into circulation (for example a scheduled unlock).`
    : ` <strong>Note:</strong> the total value grew slower than the price, which usually means coins were removed from circulation or the supply figure was corrected.`;
  return `<div class="item${open ? " is-open" : ""}" role="row" data-id="${esc(c.id)}">
    <button class="row" type="button" aria-expanded="${open}" aria-controls="d-${esc(c.id)}">
      <span class="c-pos" role="cell">${c.pos}</span>
      <span class="c-coin" role="cell">${logo(c, "logo--sm")}<span class="c-coin__txt"><strong>${esc(c.name)}</strong><span>${esc(c.symbol)} · ${TIERS[c.tier].label}${c.supplyDriven ? `<span class="badge badge--supply">New supply</span>` : ""}</span></span></span>
      <span class="c-val" role="cell">${usd(c.capPrev)}<span class="arrow">→</span><b>${usd(c.cap)}</b></span>
      <span class="c-chg ${dirClass(c.capPct)}" role="cell"><b>${arrow(c.capPct)} ${pct(c.capPct)}</b><small>${usd(c.capDelta, { sign: true })}</small></span>
      <span class="c-bar" role="cell"><span class="dbar" data-tip="<b>${pct(c.capPct)}</b> · ${usd(c.capDelta, { sign: true })} in 24h">${fill}</span></span>
      <span class="c-spark" role="cell">${spark(c.spark, (c.spark.at(-1) ?? 0) >= (c.spark[0] ?? 0))}</span>
      <span class="c-price" role="cell">${price(c.price)}<small class="${dirClass(c.pricePct)}">${pct(c.pricePct)}</small></span>
    </button>
    <div class="detail" id="d-${esc(c.id)}">
      <p>On <strong>${pkStamp(dayBefore(state.data.generatedAt))}</strong> (PKT), all the ${esc(c.symbol)} coins in circulation were worth <strong>${usd(c.capPrev)}</strong> together. 24 hours later, on <strong>${pkStamp(state.data.generatedAt)}</strong>, they were worth <strong>${usd(c.cap)}</strong>. That's <strong>${usd(Math.abs(c.capDelta))} ${verb}</strong>, a change of <strong class="${dirClass(c.capPct)}">${pct(c.capPct)}</strong>.${priceLine}${supplyLine}</p>
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
  const id = item.dataset.id;
  const open = !state.open.has(id);
  open ? state.open.add(id) : state.open.delete(id);
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
  state.hideSupply = !state.hideSupply; state.limit = PAGE;
  e.currentTarget.setAttribute("aria-pressed", state.hideSupply);
  renderBoard();
});
$("#sort").addEventListener("change", (e) => { state.sort = e.target.value; renderBoard(); });
$("#more").addEventListener("click", () => { state.limit += PAGE; renderBoard(); });
$("#dateSelect").addEventListener("change", (e) => {
  const d = e.target.value;
  const url = new URL(location.href);
  d === state.index.latest ? url.searchParams.delete("date") : url.searchParams.set("date", d);
  history.replaceState(null, "", url);
  load(d);
});
$("#themeBtn").addEventListener("click", () => {
  const dark = document.documentElement.dataset.theme
    ? document.documentElement.dataset.theme === "dark"
    : matchMedia("(prefers-color-scheme: dark)").matches;
  const next = dark ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem("ascent-theme", next); } catch {}
});

// ── Boot ──────────────────────────────────────────────────────────────────────
(async function boot() {
  try {
    state.index = await getJSON("data/index.json");
  } catch {
    state.index = null;
  }
  const sel = $("#dateSelect");
  if (state.index?.days?.length) {
    sel.innerHTML = state.index.days.map((d, i) =>
      `<option value="${d.date}">${i === 0 ? "Latest" : pkStamp(d.generatedAt ?? `${d.date}T12:00:00Z`)}${d.top ? ` · ${esc(d.top.symbol)} ${pct(d.top.capPct, 0)}` : ""}</option>`).join("");
  } else {
    sel.closest(".datepick").hidden = true;
  }
  const wanted = new URLSearchParams(location.search).get("date");
  const valid = state.index?.days?.some((d) => d.date === wanted) ? wanted : state.index?.latest;
  if (valid) sel.value = valid;
  await load(valid);
})();
