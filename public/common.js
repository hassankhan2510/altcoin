// Shared by every Ascent page: formatting, coin visuals, tooltips, theme, date picker, data loading.
import { realGrowth, realSummary, VERDICTS } from "./score.js";

export { VERDICTS };
export const $ = (s, el = document) => el.querySelector(s);
export const TIERS = {
  small: { label: "Small", range: "$15M–$100M" },
  mid: { label: "Mid", range: "$100M–$500M" },
  large: { label: "Large", range: "$500M–$2B" },
};

// ── Formatting ────────────────────────────────────────────────────────────────
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const MINUS = "−";
export function usd(n, { sign = false } = {}) {
  if (n == null) return "—";
  const a = Math.abs(n);
  const s = a >= 1e9 ? `${(a / 1e9).toFixed(2)}B` : a >= 1e6 ? `${(a / 1e6).toFixed(a >= 1e8 ? 0 : 1)}M` : a >= 1e3 ? `${(a / 1e3).toFixed(0)}K` : a.toFixed(0);
  const pre = n < 0 ? MINUS : sign ? "+" : "";
  return `${pre}$${s}`;
}
export function price(p) {
  if (p == null) return "—";
  if (p >= 1000) return `$${p.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (p >= 1) return `$${p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 3 })}`;
  return `$${Number(p.toPrecision(4))}`;
}
export const pct = (p, d = 1) => (p == null ? "—" : `${p > 0 ? "+" : p < 0 ? MINUS : ""}${Math.abs(p).toFixed(d)}%`);
export const dirClass = (p) => (p > 0 ? "is-up" : p < 0 ? "is-down" : "");
export const arrow = (p) => (p > 0 ? "▲" : p < 0 ? "▼" : "•");
export const longDate = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
export const shortDate = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
export function ago(iso) {
  const h = (Date.now() - new Date(iso).getTime()) / 36e5;
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} minutes ago`;
  if (h < 48) return `${Math.round(h)} hour${Math.round(h) === 1 ? "" : "s"} ago`;
  return `${Math.round(h / 24)} days ago`;
}
export const localTime = (iso) => new Date(iso).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short", timeZoneName: "short" });
export const hilite = (t) => esc(t).replace(/(\$[\d.]+[KMB]|[+−-]?[\d.]+%)/g, "<strong>$1</strong>");

// ── Coin visuals ──────────────────────────────────────────────────────────────
export function logo(c, size = "") {
  return `<img class="logo ${size}" src="${esc(c.image)}" alt="" loading="lazy" decoding="async" width="36" height="36" data-sym="${esc(c.symbol.slice(0, 3))}">`;
}

export function spark(values, up, { h = 34 } = {}) {
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
export const sparkUp = (c) => (c.spark?.at(-1) ?? 0) >= (c.spark?.[0] ?? 0);

/** Small pill: "Real 100" / "Mixed 64" / "New coins 15" / "Price fell 0". Nothing for shrinking coins. */
export function scorePill(c) {
  if (c.score == null) return "";
  const short = { real: "Real", mixed: "Mixed", supply: "New coins", pricefell: "Price fell" }[c.verdict];
  const tip = `<b>Real Growth Score ${c.score}/100</b><br>${VERDICTS[c.verdict].long}.`;
  return `<span class="score score--${c.verdict}" data-tip="${esc(tip)}" aria-label="Real Growth Score ${c.score} out of 100: ${VERDICTS[c.verdict].long}">${c.verdict === "real" ? "✓ " : c.verdict === "mixed" ? "" : "⚠ "}${short} <b>${c.score}</b></span>`;
}

/** Stacked bar: how much of a coin's dollar growth came from buyers vs new coins. */
export function splitBar(priceUsd, supplyUsd, { big = false } = {}) {
  const b = Math.max(0, priceUsd), s = Math.max(0, supplyUsd), t = b + s || 1;
  const seg = (cls, v, label) => (v > 0 ? `<span class="split__seg split__seg--${cls}" style="flex-grow:${v / t}" data-tip="<b>${usd(v)}</b> ${label}"></span>` : "");
  return `<div class="split${big ? " split--big" : ""}">
    <div class="split__bar" role="img" aria-label="${usd(priceUsd)} from buyers, ${usd(supplyUsd)} from new coins">${seg("buyers", b, "from buyers (price went up)")}${seg("supply", s, "from new coins (supply went up)")}</div>
    <div class="split__legend"><span><i class="split__dot split__dot--buyers"></i>From buyers <b>${usd(priceUsd)}</b></span><span><i class="split__dot split__dot--supply"></i>From new coins <b>${usd(supplyUsd)}</b></span></div>
  </div>`;
}

/** One plain-English sentence explaining where a coin's growth came from. */
export function realSentence(c) {
  if (c.score == null) return "";
  const priceWord = c.pricePct > 0 ? `the price of each coin rose <strong>${pct(c.pricePct)}</strong>` : `the price of each coin actually fell <strong>${pct(c.pricePct)}</strong>`;
  if (c.verdict === "real") return `This growth is <strong>real</strong>: ${priceWord}, and the number of coins barely changed. Buyers drove it.`;
  if (c.verdict === "mixed") return `This growth is <strong>mixed</strong>: ${priceWord}, but the number of coins also grew <strong>${pct(c.supplyPct)}</strong>. Part of the rise came from new coins, not buyers.`;
  return `<strong>Careful:</strong> ${priceWord}, while the number of coins grew <strong>${pct(c.supplyPct)}</strong>. Most of this rise came from new coins being released (or counted), not from people buying.`;
}

// ── Data ──────────────────────────────────────────────────────────────────────
export async function getJSON(url) {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

/** Older snapshots predate the score; compute it in the browser so every day looks the same. */
export function enrich(data) {
  for (const c of data.coins) if (c.verdict === undefined) Object.assign(c, realGrowth(c) ?? { score: null, verdict: null });
  data.summary.real ??= realSummary(data.coins);
  return data;
}

export async function loadSnapshot(date, index) {
  const isLatest = !date || date === index?.latest;
  return enrich(await getJSON(isLatest ? "data/latest.json" : `data/history/${date}.json`));
}

// ── Page chrome: tooltip, theme, date picker, nav ─────────────────────────────
export function initChrome({ onDate, generatedAt }) {
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

  const tip = $("#tip");
  const showTip = (html, x, y) => {
    tip.innerHTML = html;
    tip.hidden = false;
    const r = tip.getBoundingClientRect();
    tip.style.left = `${Math.min(window.innerWidth - r.width - 8, Math.max(8, x - r.width / 2))}px`;
    tip.style.top = `${y - r.height - 12 < 8 ? y + 18 : y - r.height - 12}px`;
  };
  const hideTip = () => (tip.hidden = true);
  document.addEventListener("pointermove", (e) => {
    const sv = e.target.closest?.("svg.spark");
    document.querySelectorAll("svg.spark line.cross[visibility='visible']").forEach((l) => l.closest("svg") !== sv && l.setAttribute("visibility", "hidden"));
    if (sv) {
      const vals = JSON.parse(sv.dataset.spark);
      const r = sv.getBoundingClientRect();
      const i = Math.round(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * (vals.length - 1));
      const line = sv.querySelector(".cross");
      const x = (i / (vals.length - 1)) * 100;
      line.setAttribute("x1", x); line.setAttribute("x2", x); line.setAttribute("visibility", "visible");
      const when = new Date(new Date(generatedAt()).getTime() - (1 - i / (vals.length - 1)) * 7 * 864e5);
      return showTip(`<b>${price(vals[i])}</b><br>${when.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}`, e.clientX, r.top);
    }
    const t = e.target.closest?.("[data-tip]");
    if (t) return showTip(t.dataset.tip, e.clientX, t.getBoundingClientRect().top);
    hideTip();
  });
  document.addEventListener("pointerleave", hideTip);
  window.addEventListener("scroll", hideTip, { passive: true });

  $("#themeBtn").addEventListener("click", () => {
    const root = document.documentElement;
    const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = dark ? "light" : "dark";
    try { localStorage.setItem("ascent-theme", root.dataset.theme); } catch {}
  });

  $("#dateSelect").addEventListener("change", (e) => setDate(e.target.value));
  let index = null;
  function setDate(d) {
    const url = new URL(location.href);
    d && d !== index?.latest ? url.searchParams.set("date", d) : url.searchParams.delete("date");
    history.replaceState(null, "", url);
    syncNav();
    onDate(d, index);
  }

  return (async function boot() {
    try { index = await getJSON("data/index.json"); } catch { index = null; }
    const sel = $("#dateSelect");
    if (index?.days?.length) {
      sel.innerHTML = index.days.map((d, i) =>
        `<option value="${d.date}">${i === 0 ? "Today" : shortDate(d.date)}${d.top ? ` · ${esc(d.top.symbol)} ${pct(d.top.capPct, 0)}` : ""}</option>`).join("");
    } else {
      sel.closest(".datepick").hidden = true;
    }
    const wanted = new URLSearchParams(location.search).get("date");
    const date = index?.days?.some((d) => d.date === wanted) ? wanted : index?.latest;
    if (date) sel.value = date;
    syncNav();
    await onDate(date, index);
    return index;
  })();
}

/** Nav links keep the chosen day when you switch pages. */
function syncNav() {
  const d = new URLSearchParams(location.search).get("date");
  document.querySelectorAll(".nav a[data-href]").forEach((a) => (a.href = d ? `${a.dataset.href}?date=${d}` : a.dataset.href));
}

/** "Comparing 10:41 today with 10:41 yesterday" in the viewer's own time zone. */
export function windowLabel(iso) {
  const t = new Date(iso);
  const hm = t.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const tz = t.toLocaleTimeString([], { timeZoneName: "short" }).split(" ").pop();
  return `Comparing ${hm} on ${t.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} with ${hm} the day before (${tz})`;
}
