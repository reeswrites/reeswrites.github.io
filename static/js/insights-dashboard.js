"use strict";

/**
 * Shared insights dashboard shell for data pages.
 *
 * Drives: loading state, time-window presets, custom date range, stat card
 * rows, timeline chart, entity leaderboard, and optional extra charts.
 *
 * Requires insights-chart.js to be loaded first.
 *
 * @example
 *   InsightsDashboard.init({
 *     prefix:        "beer-",
 *     color:         "#fd7e14",
 *     defaultEntity: "styles",       // optional; defaults to first entity
 *     emptyLabel:    "check-ins",
 *     timelineLabel: "Check-ins over time",
 *
 *     rows: [
 *       { items: [
 *           { id: "beers",  label: "Unique beers",  type: "stat",  value: (agg) => agg.uniqueBeers },
 *           { id: "rating", label: "Avg rating",    type: "stat",  value: (agg) => agg.avgRating?.toFixed(2) ?? "—" },
 *       ]},
 *       { items: [
 *           { id: "top-style", label: "Top style",  type: "label", value: (agg) => agg.topStyles[0]?.label ?? "—" },
 *       ]},
 *     ],
 *
 *     entities: [
 *       { id: "styles",    label: "Styles" },
 *       { id: "breweries", label: "Breweries" },
 *     ],
 *
 *     load:       async () => ({ weeks, lastUpdated?, allByBucket? }),
 *     aggregate:  (minIdx, maxIdx) => ({
 *       leaderboards: { entity: [{label, sub, count, avgRating?}] },
 *       byBucket: Map<weekIdx,count>,
 *     }),
 *     extraCharts:  (agg, container) => { /* optional *\/ },
 *     formatCount:  (item, i, entity) => "...",   // optional
 *     showBars:     (entity) => true,              // optional; default true
 *   });
 */
const InsightsDashboard = (() => {
  "use strict";

  function init(cfg) {
    const {
      prefix        = "",
      color         = "#0d6efd",
      defaultEntity,
      emptyLabel    = "items",
      timelineLabel = "Activity over time",
      rows          = [],
      entities      = [],
      dateless      = false,
      excludeYears  = [],
      load,
      aggregate,
      extraCharts:    extraChartsCb    = null,
      formatCount:    formatCountCb    = null,
      showBars:       showBarsCb       = null,
      onWindowChange: onWindowChangeCb = null,
    } = cfg;

    const SHOW_STEP = 10;

    // ── Per-instance state ───────────────────────────────────────────────────
    let WEEKS        = [];
    let allByBucket  = null;
    let minBucketIdx = 0;
    let maxBucketIdx = 0;
    let activeEntity = defaultEntity ?? entities[0]?.id ?? "";
    let visibleCount = SHOW_STEP;
    let lastAgg      = null;

    // ── DOM helpers ──────────────────────────────────────────────────────────

    function byId(suffix) {
      return document.getElementById(prefix + suffix);
    }

    function esc(str) {
      return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    function fmt(yyyyMM) {
      const [y, m] = yyyyMM.split("-");
      return new Date(+y, +m - 1).toLocaleDateString("en-US", {
        month: "short",
        year:  "numeric",
      });
    }

    // ── Stat rows ─────────────────────────────────────────────────────────────

    function buildStatRows() {
      const mount = byId("stat-rows");
      if (!mount || !rows.length) return;
      rows.forEach((row) => {
        const n = row.items.length;
        const rowEl = document.createElement("div");
        rowEl.className = `row g-2 mb-3 row-cols-2 row-cols-md-${n}`;
        row.items.forEach((item) => {
          const isLabel = item.type === "label";
          const col = document.createElement("div");
          col.className = "col";
          col.innerHTML = `<div class="card h-100">
              <div class="card-body d-flex flex-column align-items-center justify-content-center text-center py-2">
                ${isLabel ? `<div class="text-muted small">${esc(item.label)}</div>` : ""}
                <div class="${isLabel ? "fw-semibold" : "fw-bold fs-5"}" id="${esc(prefix + "stat-" + item.id)}">—</div>
                ${!isLabel ? `<div class="text-muted small">${esc(item.label)}</div>` : ""}
              </div>
            </div>`;
          rowEl.appendChild(col);
        });
        mount.appendChild(rowEl);
      });
    }

    function renderStatRows(agg) {
      rows.forEach((row) => {
        row.items.forEach((item) => {
          const el = document.getElementById(prefix + "stat-" + item.id);
          if (el) el.textContent = item.value(agg);
        });
      });
    }

    // ── Boot ─────────────────────────────────────────────────────────────────

    async function boot() {
      let result;
      try {
        result = await load();
      } catch {
        const loadingEl = byId("insights-loading");
        if (loadingEl) loadingEl.textContent = "⚠️ Could not load insights data.";
        return;
      }

      if (!dateless) {
        WEEKS = result.weeks;
        if (result.allByBucket) allByBucket = result.allByBucket;
      }

      if (result.lastUpdated) {
        const dateEl = document.getElementById("last-updated-date");
        if (dateEl) dateEl.textContent = result.lastUpdated;
      }

      const loadingEl = byId("insights-loading");
      if (loadingEl) {
        loadingEl.style.display = "none";
        const contentEl = byId("insights-content");
        if (contentEl) contentEl.style.display = "";
      }

      buildStatRows();
      buildEntityToggle();

      if (dateless) {
        renderDateless();
      } else {
        buildPresets();
        buildYearPresets();
        setWindow(0, WEEKS.length - 1);
        bindCustomRange();
      }
    }

    // ── Dateless render (no time window) ─────────────────────────────────────

    function renderDateless() {
      lastAgg = aggregate();
      renderStatRows(lastAgg);
      renderList(lastAgg);
      if (extraChartsCb) extraChartsCb(lastAgg, byId("extra-charts"));
      if (onWindowChangeCb) onWindowChangeCb(null, null, []);
    }

    // ── Window ───────────────────────────────────────────────────────────────

    function setWindow(lo, hi) {
      minBucketIdx = lo;
      maxBucketIdx = hi;
      visibleCount = SHOW_STEP;
      highlightActivePreset();
      updateCustomInputs();
      render();
    }

    // ── Presets ──────────────────────────────────────────────────────────────

    function buildPresets() {
      const now      = new Date();
      const d30Str   = new Date(now.getTime() - 30  * 86_400_000).toISOString().slice(0, 10);
      const d365Str  = new Date(now.getTime() - 365 * 86_400_000).toISOString().slice(0, 10);
      const d1JanStr = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);

      const on = (suffix, handler) => {
        const btn = byId(suffix);
        if (btn) btn.addEventListener("click", handler);
      };

      on("btn-alltime",  () => setWindow(0, WEEKS.length - 1));
      on("btn-last30",   () => {
        const lo = WEEKS.findIndex((w) => w >= d30Str);
        if (lo !== -1) setWindow(lo, WEEKS.length - 1);
      });
      on("btn-thisyear", () => {
        const lo = WEEKS.findIndex((w) => w >= d1JanStr);
        if (lo !== -1) setWindow(lo, WEEKS.length - 1);
      });
      on("btn-last12",   () => {
        const lo = WEEKS.findIndex((w) => w >= d365Str);
        if (lo !== -1) setWindow(lo, WEEKS.length - 1);
      });
    }

    function buildYearPresets() {
      const container = byId("year-buttons");
      if (!container) return;
      const years = [...new Set(WEEKS.map((w) => w.slice(0, 4)))].sort().reverse();
      years.forEach((year) => {
        const btn = document.createElement("button");
        btn.type         = "button";
        btn.className    = `btn btn-sm btn-outline-secondary me-1 mb-1 ${prefix}preset-btn`;
        btn.textContent  = year;
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
      document.querySelectorAll(`.${prefix}preset-btn`).forEach((b) => {
        b.classList.remove("btn-secondary");
        b.classList.add("btn-outline-secondary");
      });

      const lo = minBucketIdx, hi = maxBucketIdx;
      const now      = new Date();
      const d30Str   = new Date(now.getTime() - 30  * 86_400_000).toISOString().slice(0, 10);
      const d365Str  = new Date(now.getTime() - 365 * 86_400_000).toISOString().slice(0, 10);
      const d1JanStr = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);

      if (lo === 0 && hi === WEEKS.length - 1) {
        _activatePresetBtn("btn-alltime");
      } else if (hi === WEEKS.length - 1 && WEEKS[lo] >= d30Str) {
        _activatePresetBtn("btn-last30");
      } else if (hi === WEEKS.length - 1 && WEEKS[lo] >= d1JanStr) {
        _activatePresetBtn("btn-thisyear");
      } else if (hi === WEEKS.length - 1 && WEEKS[lo] >= d365Str) {
        _activatePresetBtn("btn-last12");
      } else {
        const years = [...new Set(WEEKS.slice(lo, hi + 1).map((w) => w.slice(0, 4)))];
        if (years.length === 1) {
          const yearBtn = document.querySelector(`#${prefix}year-buttons [data-year="${years[0]}"]`);
          if (yearBtn) _activateBtn(yearBtn);
        }
      }
    }

    function _activatePresetBtn(suffix) { _activateBtn(byId(suffix)); }
    function _activateBtn(btn) {
      if (!btn) return;
      btn.classList.remove("btn-outline-secondary");
      btn.classList.add("btn-secondary");
    }

    // ── Custom range ─────────────────────────────────────────────────────────

    function bindCustomRange() {
      const startEl = byId("range-start");
      const endEl   = byId("range-end");
      if (!startEl || !endEl) return;

      const firstMonth = WEEKS[0].slice(0, 7);
      const lastMonth  = WEEKS[WEEKS.length - 1].slice(0, 7);
      startEl.min = endEl.min = firstMonth;
      startEl.max = endEl.max = lastMonth;

      function applyCustom() {
        const s = startEl.value, e = endEl.value;
        if (!s || !e || s > e) return;
        const lo = WEEKS.findIndex((w) => w >= s + "-01");
        if (lo === -1) return;
        const endNext = new Date(e + "-01");
        endNext.setMonth(endNext.getMonth() + 1);
        const hi = WEEKS.reduce((acc, w, i) => (w < endNext.toISOString().slice(0, 10) ? i : acc), lo);
        setWindow(lo, hi);
      }

      startEl.addEventListener("change", applyCustom);
      endEl.addEventListener("change",   applyCustom);
    }

    function updateCustomInputs() {
      const startEl = byId("range-start");
      const endEl   = byId("range-end");
      if (startEl) startEl.value = WEEKS[minBucketIdx].slice(0, 7);
      if (endEl)   endEl.value   = WEEKS[maxBucketIdx].slice(0, 7);
    }

    // ── Entity toggle ─────────────────────────────────────────────────────────

    function buildEntityToggle() {
      const bar = byId("entity-bar");
      if (!bar || entities.length <= 1) return;
      entities.forEach((ent) => {
        const btn = document.createElement("button");
        btn.type         = "button";
        btn.className    = `btn btn-sm ${ent.id === activeEntity ? "btn-secondary" : "btn-outline-secondary"}`;
        btn.dataset.entity = ent.id;
        btn.textContent  = ent.label;
        btn.addEventListener("click", () => {
          activeEntity = ent.id;
          visibleCount = SHOW_STEP;
          bar.querySelectorAll("[data-entity]").forEach((b) => {
            b.classList.remove("btn-secondary");
            b.classList.add("btn-outline-secondary");
          });
          btn.classList.remove("btn-outline-secondary");
          btn.classList.add("btn-secondary");
          renderList();
        });
        bar.appendChild(btn);
      });
    }

    // ── Render ────────────────────────────────────────────────────────────────

    function render() {
      lastAgg = aggregate(minBucketIdx, maxBucketIdx);
      renderStatRows(lastAgg);
      renderList(lastAgg);
      renderTimeline(lastAgg);
      if (extraChartsCb) extraChartsCb(lastAgg, byId("extra-charts"));
      if (onWindowChangeCb) onWindowChangeCb(minBucketIdx, maxBucketIdx, WEEKS);
    }

    function renderList(agg) {
      if (!agg) agg = lastAgg;
      const items     = (agg?.leaderboards || {})[activeEntity] || [];
      const maxCount  = items[0]?.count ?? 1;
      const container = byId("top-list");
      if (!container) return;
      container.innerHTML = "";

      // No entities configured — nothing to render in the leaderboard slot.
      if (!entities.length) return;

      if (!items.length) {
        container.innerHTML = `<p class="text-muted">No ${esc(emptyLabel)} in this window.</p>`;
        return;
      }

      const doShowBars = showBarsCb ? showBarsCb(activeEntity) : true;
      items.slice(0, visibleCount).forEach((item, i) => {
        const pct      = Math.round((item.count / maxCount) * 100);
        const countStr = formatCountCb
          ? formatCountCb(item, i, activeEntity)
          : `${item.count.toLocaleString()}${i === 0 ? ` ${emptyLabel}` : ""}`;
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
            ${doShowBars ? `<div class="progress mt-1" style="height:4px"><div class="progress-bar" style="width:${pct}%"></div></div>` : ""}
          </div>`;
        container.appendChild(row);
      });

      if (visibleCount < items.length) {
        const nextCount = Math.min(visibleCount + SHOW_STEP, items.length);
        const btn       = document.createElement("button");
        btn.type        = "button";
        btn.className   = "btn btn-sm btn-outline-secondary mt-1";
        btn.textContent = nextCount === items.length
          ? `Show all ${items.length.toLocaleString()}`
          : "Show 10 more";
        btn.addEventListener("click", () => { visibleCount = nextCount; renderList(agg); });
        const wrap = document.createElement("div");
        wrap.style.paddingLeft = "calc(1.5rem + 0.5rem)";
        wrap.appendChild(btn);
        container.appendChild(wrap);
      }
    }

    function renderTimeline(agg) {
      const container = byId("timeline-chart");
      if (!container) return;
      const { labels, values, granularity, inWindowFlags } =
        InsightsChart.bucketByGranularity(WEEKS, agg.byBucket, minBucketIdx, maxBucketIdx, allByBucket, excludeYears);
      const headingEl = byId("timeline-heading");
      if (headingEl) headingEl.textContent = `${timelineLabel} (${granularity})`;
      InsightsChart.barChart(`#${prefix}timeline-chart`, { labels, values, color, inWindowFlags });
    }

    // ── Kick off ──────────────────────────────────────────────────────────────
    boot();
  }

  function initRecentList({ listSelector = ".recent-item", buttonId = "load-more-btn", batchSize = 5 } = {}) {
    const items = Array.from(document.querySelectorAll(listSelector));
    const btn   = document.getElementById(buttonId);
    if (!items.length || !btn) return;
    let shown = 0;

    function showBatch() {
      if (shown > 0) items[shown - 1].classList.add("border-bottom");
      items.slice(shown, shown + batchSize).forEach((el) => el.classList.remove("d-none"));
      shown += batchSize;
      if (shown <= items.length) items[shown - 1]?.classList.remove("border-bottom");
      if (shown >= items.length) btn.style.display = "none";
    }

    showBatch();
    btn.addEventListener("click", showBatch);
  }

  return { init, initRecentList };
})();
