"use strict";

// CHECKINS injected inline in beer.html: [[style, brewery, beerName, rating, date], ...]

let WEEKS = [];      // sorted "YYYY-MM-DD" week-start strings (derived at init)
let CHECKINS_W = []; // [[style, brewery, name, rating, weekIdx], ...]

let minBucketIdx = 0;
let maxBucketIdx = 0;
let activeEntity = "styles";
let visibleCount = 10;
const SHOW_STEP = 10;

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
function beerInit() {
  const weekSet = new Set();
  for (const c of CHECKINS) weekSet.add(weekStart(c[4]));
  WEEKS = [...weekSet].sort();
  const widx = new Map(WEEKS.map((w, i) => [w, i]));
  CHECKINS_W = CHECKINS.map((c) => [c[0], c[1], c[2], c[3], widx.get(weekStart(c[4]))]);

  buildDatePresets();
  buildYearPresets();
  setWindow(0, WEEKS.length - 1);
  bindEntityToggle();
  bindCustomRange();
}

function weekStart(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Window helpers
// ---------------------------------------------------------------------------
function setWindow(lo, hi) {
  minBucketIdx = lo;
  maxBucketIdx = hi;
  visibleCount = SHOW_STEP;
  highlightActivePreset();
  updateCustomInputs();
  render();
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------
function buildDatePresets() {
  const now = new Date();

  const d30 = new Date(now);
  d30.setDate(d30.getDate() - 30);
  const d30Str = d30.toISOString().slice(0, 10);

  const d365 = new Date(now);
  d365.setDate(d365.getDate() - 365);
  const d365Str = d365.toISOString().slice(0, 10);

  document.getElementById("beer-btn-alltime").addEventListener("click", () =>
    setWindow(0, WEEKS.length - 1),
  );
  document.getElementById("beer-btn-last30").addEventListener("click", () => {
    const lo = WEEKS.findIndex((w) => w >= d30Str);
    if (lo !== -1) setWindow(lo, WEEKS.length - 1);
  });
  document.getElementById("beer-btn-last12").addEventListener("click", () => {
    const lo = WEEKS.findIndex((w) => w >= d365Str);
    if (lo !== -1) setWindow(lo, WEEKS.length - 1);
  });
}

function buildYearPresets() {
  const years = [...new Set(WEEKS.map((w) => w.slice(0, 4)))].sort().reverse();
  const container = document.getElementById("beer-year-buttons");
  years.forEach((year) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-sm btn-outline-secondary me-1 mb-1 beer-preset-btn";
    btn.textContent = year;
    btn.dataset.year = year;
    btn.addEventListener("click", () => {
      const lo = WEEKS.findIndex((w) => w.slice(0, 4) === year);
      const hi = WEEKS.reduce((acc, w, i) => (w.slice(0, 4) === year ? i : acc), lo);
      setWindow(lo, hi);
    });
    container.appendChild(btn);
  });
}

function highlightActivePreset() {
  document.querySelectorAll(".beer-preset-btn").forEach((b) => {
    b.classList.remove("btn-secondary");
    b.classList.add("btn-outline-secondary");
  });

  const lo = minBucketIdx;
  const hi = maxBucketIdx;
  const windowWeeks = WEEKS.slice(lo, hi + 1);
  const years = [...new Set(windowWeeks.map((w) => w.slice(0, 4)))];

  const now = new Date();
  const d365 = new Date(now);
  d365.setDate(d365.getDate() - 365);
  const d30 = new Date(now);
  d30.setDate(d30.getDate() - 30);

  if (lo === 0 && hi === WEEKS.length - 1) {
    _activatePresetBtn("beer-btn-alltime");
  } else if (hi === WEEKS.length - 1 && WEEKS[lo] >= d30.toISOString().slice(0, 10)) {
    _activatePresetBtn("beer-btn-last30");
  } else if (hi === WEEKS.length - 1 && WEEKS[lo] >= d365.toISOString().slice(0, 10)) {
    _activatePresetBtn("beer-btn-last12");
  } else if (years.length === 1) {
    const yearBtn = document.querySelector(`#beer-year-buttons [data-year="${years[0]}"]`);
    if (yearBtn) _activateBtn(yearBtn);
  }
}

function _activatePresetBtn(id) {
  _activateBtn(document.getElementById(id));
}
function _activateBtn(btn) {
  if (btn) {
    btn.classList.remove("btn-outline-secondary");
    btn.classList.add("btn-secondary");
  }
}

// ---------------------------------------------------------------------------
// Custom range
// ---------------------------------------------------------------------------
function bindCustomRange() {
  const startEl = document.getElementById("beer-range-start");
  const endEl = document.getElementById("beer-range-end");
  if (!startEl || !endEl) return;

  const firstMonth = WEEKS[0].slice(0, 7);
  const lastMonth = WEEKS[WEEKS.length - 1].slice(0, 7);
  startEl.min = firstMonth;
  startEl.max = lastMonth;
  endEl.min = firstMonth;
  endEl.max = lastMonth;

  function applyCustom() {
    const s = startEl.value;
    const e = endEl.value;
    if (!s || !e || s > e) return;
    const lo = WEEKS.findIndex((w) => w >= s + "-01");
    if (lo === -1) return;
    const endNext = new Date(e + "-01");
    endNext.setMonth(endNext.getMonth() + 1);
    const endNextStr = endNext.toISOString().slice(0, 10);
    const hi = WEEKS.reduce((acc, w, i) => (w < endNextStr ? i : acc), lo);
    setWindow(lo, hi);
  }

  startEl.addEventListener("change", applyCustom);
  endEl.addEventListener("change", applyCustom);
}

function updateCustomInputs() {
  const startEl = document.getElementById("beer-range-start");
  const endEl = document.getElementById("beer-range-end");
  if (startEl) startEl.value = WEEKS[minBucketIdx].slice(0, 7);
  if (endEl) endEl.value = WEEKS[maxBucketIdx].slice(0, 7);
}

// ---------------------------------------------------------------------------
// Entity toggle
// ---------------------------------------------------------------------------
function bindEntityToggle() {
  document.querySelectorAll("[data-beer-entity]").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeEntity = btn.dataset.beerEntity;
      visibleCount = SHOW_STEP;
      document.querySelectorAll("[data-beer-entity]").forEach((b) => {
        b.classList.remove("btn-secondary");
        b.classList.add("btn-outline-secondary");
      });
      btn.classList.remove("btn-outline-secondary");
      btn.classList.add("btn-secondary");
      renderList();
    });
  });
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------
function aggregateWindow() {
  const byStyle = new Map();
  const byBrewery = new Map();
  const byBeer = new Map();
  const byBucket = new Map(); // weekIdx → count
  const byRating = new Map();
  let total = 0;
  let ratingSum = 0;
  let ratedCount = 0;

  for (const [style, brewery, name, rating, wi] of CHECKINS_W) {
    if (wi < minBucketIdx || wi > maxBucketIdx) continue;
    total++;

    // Styles
    if (!byStyle.has(style)) byStyle.set(style, { count: 0, ratingSum: 0, ratedCount: 0 });
    const s = byStyle.get(style);
    s.count++;
    if (rating > 0) { s.ratingSum += rating; s.ratedCount++; }

    // Breweries
    if (!byBrewery.has(brewery)) byBrewery.set(brewery, { count: 0, ratingSum: 0, ratedCount: 0 });
    const b = byBrewery.get(brewery);
    b.count++;
    if (rating > 0) { b.ratingSum += rating; b.ratedCount++; }

    // Beers (unique by name+brewery)
    const beerKey = `${name}||${brewery}`;
    if (!byBeer.has(beerKey)) byBeer.set(beerKey, { name, brewery, count: 0, ratingSum: 0, ratedCount: 0 });
    const br = byBeer.get(beerKey);
    br.count++;
    if (rating > 0) { br.ratingSum += rating; br.ratedCount++; }

    // Timeline
    byBucket.set(wi, (byBucket.get(wi) || 0) + 1);

    // Rating distribution + overall avg
    if (rating > 0) {
      ratingSum += rating;
      ratedCount++;
      const bucket = Math.round(rating * 2) / 2;
      byRating.set(bucket, (byRating.get(bucket) || 0) + 1);
    }
  }

  function toLeaderboard(map, labelFn, subFn) {
    return [...map.entries()]
      .map(([key, val]) => ({
        label: labelFn(key, val),
        sub: subFn(key, val),
        count: val.count,
        avgRating: val.ratedCount > 0 ? val.ratingSum / val.ratedCount : null,
      }))
      .sort((a, b) => b.count - a.count);
  }

  const topStyles = toLeaderboard(byStyle, (key) => key, () => "");
  const topBreweries = toLeaderboard(byBrewery, (key) => key, () => "");
  const topBeers = [...byBeer.entries()]
    .map(([, val]) => ({
      label: val.name,
      sub: val.brewery,
      count: val.count,
      avgRating: val.ratedCount > 0 ? val.ratingSum / val.ratedCount : null,
    }))
    .sort((a, b) => b.count - a.count || (b.avgRating ?? 0) - (a.avgRating ?? 0));

  return {
    total,
    uniqueBeers: byBeer.size,
    uniqueStyles: byStyle.size,
    uniqueBreweries: byBrewery.size,
    avgRating: ratedCount > 0 ? ratingSum / ratedCount : null,
    topStyles,
    topBreweries,
    topBeers,
    byBucket,
    byRating,
  };
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
function render() {
  const agg = aggregateWindow();
  renderStats(agg);
  renderList(agg);
  renderTimeline(agg);
  renderRatingDistribution(agg);
}

function renderStats(agg) {
  setText("beer-stat-total", agg.total.toLocaleString());
  setText("beer-stat-beers", agg.uniqueBeers.toLocaleString());
  setText("beer-stat-styles", agg.uniqueStyles.toLocaleString());
  setText("beer-stat-breweries", agg.uniqueBreweries.toLocaleString());
  setText("beer-stat-avg-rating", agg.avgRating !== null ? agg.avgRating.toFixed(2) : "—");

  const ts = agg.topStyles[0];
  const tb = agg.topBreweries[0];
  const tbe = agg.topBeers[0];
  setText("beer-stat-top-style", ts ? `${ts.label} (${ts.count})` : "—");
  setText("beer-stat-top-brewery", tb ? `${tb.label} (${tb.count})` : "—");
  setText("beer-stat-top-beer", tbe ? `${tbe.label} (${tbe.count})` : "—");
}

function renderList(agg) {
  if (!agg) agg = aggregateWindow();
  const items =
    { styles: agg.topStyles, breweries: agg.topBreweries, beers: agg.topBeers }[activeEntity] || [];
  const maxCount = items[0]?.count ?? 1;
  const container = document.getElementById("beer-top-list");
  container.innerHTML = "";

  if (!items.length) {
    container.innerHTML = '<p class="text-muted">No check-ins in this window.</p>';
    return;
  }

  const showBars = activeEntity !== "beers";
  const visible = items.slice(0, visibleCount);
  visible.forEach((item, i) => {
    const pct = Math.round((item.count / maxCount) * 100);
    const ratingStr = item.avgRating !== null ? item.avgRating.toFixed(2) : "—";
    const countStr =
      activeEntity === "beers"
        ? ratingStr
        : `${item.count.toLocaleString()}${i === 0 ? " beers" : ""} (${ratingStr}${i === 0 ? " avg" : ""})`;
    const row = document.createElement("div");
    row.className = "d-flex align-items-start gap-2 mb-2";
    row.innerHTML = `
      <span class="text-muted" style="min-width:1.5rem;text-align:right">${i + 1}</span>
      <div class="flex-grow-1">
        <div class="d-flex justify-content-between">
          <span class="fw-semibold">${esc(item.label)}</span>
          <span class="text-muted ms-2 text-nowrap">${countStr}</span>
        </div>
        ${item.sub ? `<small class="text-muted">${esc(item.sub)}</small>` : ""}
        ${showBars ? `<div class="progress mt-1" style="height:4px"><div class="progress-bar" style="width:${pct}%"></div></div>` : ""}
      </div>`;
    container.appendChild(row);
  });

  if (visibleCount < items.length) {
    const nextCount = Math.min(visibleCount + SHOW_STEP, items.length);
    const isLast = nextCount === items.length;
    const label = isLast ? `Show all ${items.length.toLocaleString()}` : "Show 10 more";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-sm btn-outline-secondary mt-1";
    btn.textContent = label;
    btn.addEventListener("click", () => {
      visibleCount = nextCount;
      renderList(agg);
    });
    const btnWrap = document.createElement("div");
    btnWrap.style.paddingLeft = "calc(1.5rem + 0.5rem)";
    btnWrap.appendChild(btn);
    container.appendChild(btnWrap);
  }
}

// ---------------------------------------------------------------------------
// Timeline (roughViz)
// ≤ 13 weeks  → weekly bars
// ≤ 24 distinct months → monthly bars
// else → yearly bars
// ---------------------------------------------------------------------------
function renderTimeline(agg) {
  const container = document.getElementById("beer-timeline-chart");
  if (!container || typeof roughViz === "undefined") return;
  container.innerHTML = "";

  const windowWeeks = WEEKS.slice(minBucketIdx, maxBucketIdx + 1);
  const weekCount = windowWeeks.length;
  const distinctMonths = [...new Set(windowWeeks.map((w) => w.slice(0, 7)))].sort();

  const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  let labels, values, granularity;

  if (weekCount <= 13) {
    granularity = "weekly";
    labels = windowWeeks.map((w) => {
      const d = new Date(w + "T12:00:00");
      return `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
    });
    values = windowWeeks.map((_, i) => agg.byBucket.get(minBucketIdx + i) ?? 0);
  } else if (distinctMonths.length <= 24) {
    granularity = "monthly";
    const monthTotals = {};
    for (const [bi, count] of agg.byBucket) {
      const month = WEEKS[bi].slice(0, 7);
      monthTotals[month] = (monthTotals[month] || 0) + count;
    }
    const monthKeys = Object.keys(monthTotals).sort();
    const multiYear = new Set(monthKeys.map((m) => m.slice(0, 4))).size > 1;
    labels = monthKeys.map((m) => {
      const name = MONTH_NAMES[parseInt(m.slice(5), 10) - 1];
      return multiYear ? `${name} '${m.slice(2, 4)}` : name;
    });
    values = monthKeys.map((m) => monthTotals[m]);
  } else {
    granularity = "yearly";
    const yearTotals = {};
    for (const [bi, count] of agg.byBucket) {
      const year = WEEKS[bi].slice(0, 4);
      yearTotals[year] = (yearTotals[year] || 0) + count;
    }
    const years = Object.keys(yearTotals).sort();
    labels = years;
    values = years.map((y) => yearTotals[y]);
  }

  setText("beer-timeline-heading", `Check-ins over time (${granularity})`);

  new roughViz.Bar({
    element: "#beer-timeline-chart",
    data: { labels, values },
    width: container.offsetWidth,
    color: "#fd7e14",
    fillStyle: "hachure",
    roughness: 2,
    strokeWidth: 1,
    interactive: true,
    margin: { top: 10, left: 60, right: 20, bottom: 60 },
  });
}

// ---------------------------------------------------------------------------
// Rating distribution (roughViz)
// ---------------------------------------------------------------------------
function renderRatingDistribution(agg) {
  const container = document.getElementById("beer-rating-chart");
  if (!container || typeof roughViz === "undefined") return;
  container.innerHTML = "";

  const STEPS = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];
  const LABELS = ["½★", "★", "★½", "★★", "★★½", "★★★", "★★★½", "★★★★", "★★★★½", "★★★★★"];
  const values = STEPS.map((s) => agg.byRating.get(s) || 0);

  if (values.every((v) => v === 0)) {
    container.innerHTML = '<p class="text-muted">No rated beers in this window.</p>';
    return;
  }

  new roughViz.Bar({
    element: "#beer-rating-chart",
    data: { labels: LABELS, values },
    width: container.offsetWidth,
    color: "#fd7e14",
    fillStyle: "hachure",
    roughness: 2,
    strokeWidth: 1,
    interactive: true,
    margin: { top: 10, left: 60, right: 20, bottom: 60 },
  });
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
function esc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

beerInit();
