"use strict";

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------
let DATA = null;
let minBucketIdx = 0; // current window (inclusive), index into DATA.weeks
let maxBucketIdx = 0;
let activeEntity = "artists";
let visibleCount = 10;
const SHOW_STEP = 10;

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
async function init() {
  try {
    const res = await fetch("/static/data/scrobbles.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    DATA = await res.json();
  } catch {
    document.getElementById("insights-loading").textContent =
      "⚠️ Could not load music insights data.";
    return;
  }

  document.getElementById("insights-loading").style.display = "none";
  document.getElementById("insights-content").style.display = "";
  const dateEl = document.getElementById("last-updated-date");
  if (dateEl && DATA.last_updated) dateEl.textContent = DATA.last_updated;

  buildPresets();
  buildYearPresets();
  setWindow(0, DATA.weeks.length - 1);
  bindEntityToggle();
  bindCustomRange();
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
function buildPresets() {
  const weeks = DATA.weeks;
  const now = new Date();

  // ~52 weeks ago
  const d52 = new Date(now);
  d52.setDate(d52.getDate() - 364);
  const d52Str = d52.toISOString().slice(0, 10);

  // ~30 days ago
  const d30 = new Date(now);
  d30.setDate(d30.getDate() - 30);
  const d30Str = d30.toISOString().slice(0, 10);

  document.getElementById("btn-alltime").addEventListener("click", () => {
    setWindow(0, weeks.length - 1);
  });

  document.getElementById("btn-last30").addEventListener("click", () => {
    const lo = weeks.findIndex((w) => w >= d30Str);
    if (lo === -1) return;
    setWindow(lo, weeks.length - 1);
  });

  document.getElementById("btn-last12").addEventListener("click", () => {
    const lo = weeks.findIndex((w) => w >= d52Str);
    if (lo === -1) return;
    setWindow(lo, weeks.length - 1);
  });
}

function buildYearPresets() {
  const years = [...new Set(DATA.weeks.map((w) => w.slice(0, 4)))].sort().reverse();
  const container = document.getElementById("year-preset-buttons");
  years.forEach((year) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-sm btn-outline-secondary me-1 mb-1 preset-btn";
    btn.textContent = year;
    btn.dataset.year = year;
    btn.addEventListener("click", () => {
      const lo = DATA.weeks.findIndex((w) => w.slice(0, 4) === year);
      const hi = DATA.weeks.reduce((acc, w, i) => (w.slice(0, 4) === year ? i : acc), lo);
      setWindow(lo, hi);
    });
    container.appendChild(btn);
  });
}

function highlightActivePreset() {
  document
    .querySelectorAll(".preset-btn")
    .forEach((b) => b.classList.replace("btn-secondary", "btn-outline-secondary"));
  const weeks = DATA.weeks;
  const lo = minBucketIdx;
  const hi = maxBucketIdx;
  const windowWeeks = weeks.slice(lo, hi + 1);
  const years = [...new Set(windowWeeks.map((w) => w.slice(0, 4)))];

  const d52 = new Date();
  d52.setDate(d52.getDate() - 364);
  const d52Str = d52.toISOString().slice(0, 10);

  const d30 = new Date();
  d30.setDate(d30.getDate() - 30);
  const d30Str = d30.toISOString().slice(0, 10);

  if (lo === 0 && hi === weeks.length - 1) {
    _activatePresetBtn("btn-alltime");
  } else if (hi === weeks.length - 1 && weeks[lo] >= d30Str) {
    _activatePresetBtn("btn-last30");
  } else if (hi === weeks.length - 1 && weeks[lo] >= d52Str) {
    _activatePresetBtn("btn-last12");
  } else if (years.length === 1) {
    const yearBtn = document.querySelector(`#year-preset-buttons [data-year="${years[0]}"]`);
    if (yearBtn) _activateBtn(yearBtn);
  }
}

function _activatePresetBtn(id) {
  _activateBtn(document.getElementById(id));
}
function _activateBtn(btn) {
  if (btn) btn.classList.replace("btn-outline-secondary", "btn-secondary");
}

// ---------------------------------------------------------------------------
// Custom range
// ---------------------------------------------------------------------------
function bindCustomRange() {
  const startEl = document.getElementById("range-start");
  const endEl = document.getElementById("range-end");
  if (!startEl || !endEl) return;

  const firstMonth = DATA.weeks[0].slice(0, 7);
  const lastMonth = DATA.weeks[DATA.weeks.length - 1].slice(0, 7);
  startEl.min = firstMonth;
  startEl.max = lastMonth;
  endEl.min = firstMonth;
  endEl.max = lastMonth;

  function applyCustom() {
    const s = startEl.value;
    const e = endEl.value;
    if (!s || !e || s > e) return;
    const lo = DATA.weeks.findIndex((w) => w >= s + "-01");
    if (lo === -1) return;
    // last week whose Monday is still within the end month
    const endNext = new Date(e + "-01");
    endNext.setMonth(endNext.getMonth() + 1);
    const endNextStr = endNext.toISOString().slice(0, 10);
    const hi = DATA.weeks.reduce((acc, w, i) => (w < endNextStr ? i : acc), lo);
    setWindow(lo, hi);
  }

  startEl.addEventListener("change", applyCustom);
  endEl.addEventListener("change", applyCustom);
}

function updateCustomInputs() {
  const startEl = document.getElementById("range-start");
  const endEl = document.getElementById("range-end");
  if (startEl) startEl.value = DATA.weeks[minBucketIdx].slice(0, 7);
  if (endEl) endEl.value = DATA.weeks[maxBucketIdx].slice(0, 7);
}

// ---------------------------------------------------------------------------
// Entity toggle
// ---------------------------------------------------------------------------
function bindEntityToggle() {
  document.querySelectorAll("[data-entity]").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeEntity = btn.dataset.entity;
      visibleCount = SHOW_STEP;
      document
        .querySelectorAll("[data-entity]")
        .forEach((b) => b.classList.replace("btn-secondary", "btn-outline-secondary"));
      btn.classList.replace("btn-outline-secondary", "btn-secondary");
      renderList();
    });
  });
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------
function aggregateWindow() {
  const byTrack = new Map(); // trackIdx → count
  const byBucket = new Map(); // weekIdx  → count
  let total = 0;

  for (const [ti, bi, count] of DATA.plays) {
    if (bi < minBucketIdx || bi > maxBucketIdx) continue;
    byTrack.set(ti, (byTrack.get(ti) ?? 0) + count);
    byBucket.set(bi, (byBucket.get(bi) ?? 0) + count);
    total += count;
  }

  const byArtist = new Map();
  const byAlbum = new Map();
  for (const [ti, count] of byTrack) {
    const [ai, li] = DATA.tracks[ti];
    byArtist.set(ai, (byArtist.get(ai) ?? 0) + count);
    const albumKey = `${ai}:${li}`;
    if (!byAlbum.has(albumKey)) {
      byAlbum.set(albumKey, { artist: DATA.artists[ai], album: DATA.albums[li], count: 0 });
    }
    byAlbum.get(albumKey).count += count;
  }

  const topSongs = [...byTrack.entries()]
    .map(([ti, count]) => {
      const [ai, li, si] = DATA.tracks[ti];
      return { label: DATA.songs[si], sub: `${DATA.artists[ai]} — ${DATA.albums[li]}`, count };
    })
    .sort((a, b) => b.count - a.count);

  const topAlbums = [...byAlbum.values()]
    .sort((a, b) => b.count - a.count)
    .map((a) => ({ label: a.album, sub: a.artist, count: a.count }));

  const topArtists = [...byArtist.entries()]
    .map(([ai, count]) => ({ label: DATA.artists[ai], sub: "", count }))
    .sort((a, b) => b.count - a.count);

  const uniqueArtists = byArtist.size;
  const uniqueSongs = byTrack.size;

  // Busiest month: aggregate weekly buckets → "YYYY-MM"
  const byMonthAgg = new Map();
  for (const [bi, count] of byBucket) {
    const month = DATA.weeks[bi].slice(0, 7);
    byMonthAgg.set(month, (byMonthAgg.get(month) ?? 0) + count);
  }
  let busiestMonth = null,
    busiestCount = 0;
  for (const [month, count] of byMonthAgg) {
    if (count > busiestCount) {
      busiestCount = count;
      busiestMonth = month;
    }
  }

  return {
    total,
    uniqueArtists,
    uniqueSongs,
    busiestMonth,
    busiestCount,
    topSongs,
    topAlbums,
    topArtists,
    byBucket,
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
}

function renderStats(agg) {
  setText("stat-total", agg.total.toLocaleString());
  setText("stat-artists", agg.uniqueArtists.toLocaleString());
  setText("stat-songs", agg.uniqueSongs.toLocaleString());
  setText(
    "stat-busiest-month",
    agg.busiestMonth
      ? `${fmt(agg.busiestMonth)} (${agg.busiestCount.toLocaleString()} plays)`
      : "—",
  );

  const t = agg.topArtists[0],
    l = agg.topAlbums[0],
    s = agg.topSongs[0];
  setText("stat-top-artist", t ? `${t.label} (${t.count.toLocaleString()})` : "—");
  setText("stat-top-album", l ? `${l.label} (${l.count.toLocaleString()})` : "—");
  setText("stat-top-song", s ? `${s.label} (${s.count.toLocaleString()})` : "—");
}

function renderList(agg) {
  if (!agg) agg = aggregateWindow();
  const items =
    { artists: agg.topArtists, albums: agg.topAlbums, songs: agg.topSongs }[activeEntity] || [];
  const maxCount = items[0]?.count ?? 1;
  const container = document.getElementById("top-list");
  container.innerHTML = "";

  if (!items.length) {
    container.innerHTML = '<p class="text-muted">No plays in this window.</p>';
    return;
  }

  const visible = items.slice(0, visibleCount);
  visible.forEach((item, i) => {
    const pct = Math.round((item.count / maxCount) * 100);
    const row = document.createElement("div");
    row.className = "d-flex align-items-start gap-2 mb-2";
    row.innerHTML = `
      <span class="text-muted" style="min-width:1.5rem;text-align:right">${i + 1}</span>
      <div class="flex-grow-1">
        <div class="d-flex justify-content-between">
          <span class="fw-semibold">${esc(item.label)}</span>
          <span class="text-muted ms-2 text-nowrap">${item.count.toLocaleString()}${i === 0 ? " plays" : ""}</span>
        </div>
        ${item.sub ? `<small class="text-muted">${esc(item.sub)}</small>` : ""}
        <div class="progress mt-1" style="height:4px">
          <div class="progress-bar" style="width:${pct}%"></div>
        </div>
      </div>`;
    container.appendChild(row);
  });

  if (visibleCount < items.length) {
    const nextCount = Math.min(visibleCount + SHOW_STEP, items.length);
    const isLast = nextCount === items.length;
    const label = isLast ? `Show all ${items.length.toLocaleString()}` : `Show 10 more`;
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
// ≤ 13 weeks  → weekly bars  (labeled "Jan 6", "Jan 13", …)
// single year → monthly bars
// multi-year  → yearly bars
// ---------------------------------------------------------------------------
function renderTimeline(agg) {
  const container = document.getElementById("timeline-chart");
  if (!container || typeof roughViz === "undefined") return;

  container.innerHTML = "";

  const windowWeeks = DATA.weeks.slice(minBucketIdx, maxBucketIdx + 1);
  const windowYears = [...new Set(windowWeeks.map((w) => w.slice(0, 4)))];
  const weekCount = windowWeeks.length;
  const distinctMonths = [...new Set(windowWeeks.map((w) => w.slice(0, 7)))].sort();

  const MONTH_NAMES = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  let labels, values, inWindowFlags, granularity;

  if (weekCount <= 13) {
    granularity = "weekly";
    // ---- Weekly ----
    labels = windowWeeks.map((w) => {
      const d = new Date(w + "T12:00:00");
      return `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
    });
    values = windowWeeks.map((_, i) => {
      const bi = minBucketIdx + i;
      return agg.byBucket.get(bi) ?? 0;
    });
    inWindowFlags = windowWeeks.map(() => true);
  } else if (distinctMonths.length <= 24) {
    granularity = "monthly";
    // ---- Monthly ----
    const monthTotals = {};
    for (const [bi, count] of agg.byBucket) {
      const month = DATA.weeks[bi].slice(0, 7);
      monthTotals[month] = (monthTotals[month] || 0) + count;
    }
    const monthKeys = Object.keys(monthTotals).sort();
    const multiYear = new Set(monthKeys.map((m) => m.slice(0, 4))).size > 1;
    labels = monthKeys.map((m) => {
      const name = MONTH_NAMES[parseInt(m.slice(5), 10) - 1];
      return multiYear ? `${name} '${m.slice(2, 4)}` : name;
    });
    values = monthKeys.map((m) => monthTotals[m]);
    inWindowFlags = monthKeys.map(() => true);
  } else {
    // ---- Yearly ----
    granularity = "yearly";
    const yearTotals = {};
    for (const [, bi, count] of DATA.plays) {
      const year = DATA.weeks[bi].slice(0, 4);
      yearTotals[year] = (yearTotals[year] || 0) + count;
    }
    const years = Object.keys(yearTotals).sort();
    const windowYearSet = new Set(windowYears);
    labels = years;
    values = years.map((y) => yearTotals[y]);
    inWindowFlags = years.map((y) => windowYearSet.has(y));
  }

  setText("timeline-heading", `Plays over time (${granularity})`);

  new roughViz.Bar({
    element: "#timeline-chart",
    data: { labels, values },
    width: container.offsetWidth,
    color: "#0d6efd",
    fillStyle: "hachure",
    roughness: 2,
    strokeWidth: 1,
    interactive: true,
    margin: { top: 10, left: 60, right: 20, bottom: 60 },
  });

  // Format tooltip values with locale-aware comma separators (roughViz reads attrY on hover).
  container.querySelectorAll("g[attrY]").forEach((el) => {
    const raw = el.getAttribute("attrY");
    const num = parseFloat(raw);
    if (!isNaN(num)) el.setAttribute("attrY", num.toLocaleString());
  });

  // Clamp tooltip so it never overflows the viewport on narrow screens.
  const ttip = container.querySelector(".roughViz-tooltip");
  if (ttip) {
    let clamping = false;
    new MutationObserver(() => {
      if (clamping) return;
      const rect = ttip.getBoundingClientRect();
      const overflow = rect.right - (window.innerWidth - 8);
      if (overflow > 0) {
        clamping = true;
        ttip.style.left = `${parseFloat(ttip.style.left) - overflow}px`;
        clamping = false;
      }
    }).observe(ttip, { attributes: true, attributeFilter: ["style"] });
  }

  // roughViz doesn't support per-bar colors — post-process: gray out non-window bars
  const barGroups = [...container.querySelectorAll("g")].filter(
    (g) => g.getAttribute("class") === "timeline-chart",
  );
  barGroups.forEach((group, i) => {
    if (inWindowFlags[i]) return;
    group.querySelectorAll("path[style]").forEach((p) => {
      p.setAttribute("style", p.getAttribute("style").replace(/stroke:[^;]+/, "stroke: #ced4da"));
    });
  });
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
function fmt(yyyyMM) {
  const [y, m] = yyyyMM.split("-");
  return new Date(+y, +m - 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}
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

init();
