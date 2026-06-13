"use strict";

/**
 * Declarative insights dashboard shell for data pages.
 *
 * All per-page aggregation logic is expressed as engine specs or compute functions
 * rather than hand-written closures. The dashboard handles: time-window UI,
 * stat cards, leaderboards, timeline chart, extra charts, and calendar.
 *
 * @example
 *   InsightsDashboard.init({
 *     prefix:        "beer-",
 *     color:         "#fd7e14",
 *     emptyLabel:    "check-ins",
 *     timelineLabel: "Check-ins over time",
 *     dateless:      false,
 *     excludeYears:  [],
 *
 *     // Data source (one of):
 *     dataset: "beer",                   // sync: INSIGHTS_DATASETS["beer"].rows
 *     load: async () => rows,            // async: returns row array or { rows, lastUpdated }
 *
 *     dateField: "date",                 // field used for time-windowing (default "date")
 *
 *     // Timeline
 *     timeline: { metric: "count" },     // default. Use {metric:"sum",field:"steps"} for sums.
 *
 *     // Stat cards — rows of items; each item has spec OR compute, plus optional format.
 *     rows: [
 *       { items: [
 *           // Engine spec → scalar: format(value)
 *           { id:"total", label:"Check-ins", type:"stat",  spec:{metric:"count"} },
 *           // Engine spec → top-group: format(groups[0])
 *           { id:"top",   label:"Top style", type:"label", spec:{groupBy:"style"} },
 *           // Escape hatch: format(compute(filteredRows, ctx))
 *           { id:"peak",  label:"Peak day",  type:"label",
 *             compute:(rows, ctx) => rows.reduce(...), format: v => ... },
 *       ]},
 *     ],
 *
 *     // Leaderboard entities — each drives the entity toggle + ranked list.
 *     defaultEntity: "styles",
 *     entities: [
 *       { id:"styles", label:"Styles",
 *         spec: { groupBy:"style", metric:"count", field:"rating" },
 *         formatCount: (group, i) => `${group.count} (${group.avg?.toFixed(2) ?? "—"})`,
 *         showBars: true,
 *         // Optional drill-down hooks (all optional):
 *         drillField:  "style",            // field name — enables clickable rows + default member filter
 *         drillMatch:  (row, group) => row.style === group.key, // override member filter for precise matching
 *         drillItem:   (row) => "<li>...</li>", // custom HTML per member row (raw list mode)
 *         drillRender: (members, group) => "<div>...</div>", // replace entire panel with aggregated output
 *       },
 *     ],
 *
 *     // Calendar (optional)
 *     calendar: {
 *       type: "heatmap",           // or "fullCalendar"
 *       // heatmap options:
 *       containerId: "beer-heatmap",     // DOM id
 *       navPrevId: "beer-heatmap-prev",  // optional external nav element ids
 *       navYearId: "beer-heatmap-year",
 *       navNextId: "beer-heatmap-next",
 *       popoverContent: (dateStr, items) => html,
 *       countLevel: (n) => 0..4,
 *       // fullCalendar options:
 *       tabId: "calendar-tab",           // tab button id (for lazy render)
 *       calElId: "calendar",             // container element id
 *       formatEvent: (row) => ({ title, start }),
 *     },
 *
 *     // Extra charts (optional) — rendered below leaderboard in #prefix+extra-charts.
 *     extraCharts: [
 *       { title:"Rating distribution", id:"rating",
 *         spec: { groupBy:"rating", metric:"count", fillSteps:{min:0.5,max:5,step:0.5},
 *                 sort:{by:"key",dir:"asc"}, filter:[{field:"rating",op:"gte",value:0.5}] },
 *         labels: ["½★","★","★½","★★","★★½","★★★","★★★½","★★★★","★★★★½","★★★★★"],
 *         type: "barChart",  // or "donut"
 *         emptyMessage: "No rated items in window." },
 *     ],
 *
 *     // Optional hook called after every window change.
 *     onWindowChange: (startDate, endDate) => {},
 *   });
 */
const InsightsDashboard = (() => {
  "use strict";

  // ── Week-start helper (Monday) ──────────────────────────────────────────────
  function _weekStart(dateStr) {
    const d = new Date(dateStr + "T12:00:00");
    const day = d.getDay();
    d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    return d.toISOString().slice(0, 10);
  }

  // ── Date math helpers ───────────────────────────────────────────────────────
  function _endOfWeek(weekStartStr) {
    const d = new Date(weekStartStr + "T12:00:00");
    d.setDate(d.getDate() + 6);
    return d.toISOString().slice(0, 10);
  }

  // ── Default format helpers ──────────────────────────────────────────────────
  function _autoFormatScalar(v) {
    if (v == null) return "—";
    if (typeof v === "number") {
      return Number.isInteger(v) ? v.toLocaleString() : v.toFixed(2);
    }
    return String(v);
  }

  function _autoFormatGroup(g) {
    if (!g) return "—";
    return `${g.label} (${g.count.toLocaleString()})`;
  }

  // ── Render a single stat item ───────────────────────────────────────────────
  function _renderStatItem(item, filteredRows, prefix, ctx) {
    let displayVal;
    if (item.compute) {
      const raw = item.compute(filteredRows, ctx);
      displayVal = item.format ? item.format(raw) : _autoFormatScalar(raw);
    } else if (item.spec) {
      const agg = InsightsEngine.aggregate(filteredRows, item.spec);
      if (agg.kind === "groups") {
        const top = agg.groups[0] || null;
        displayVal = item.format ? item.format(top, agg) : _autoFormatGroup(top);
      } else {
        displayVal = item.format ? item.format(agg.value) : _autoFormatScalar(agg.value);
      }
    } else {
      displayVal = "—";
    }
    const el = document.getElementById(prefix + "stat-" + item.id);
    if (el) el.textContent = displayVal;
  }

  // ── Build stat-card DOM once ────────────────────────────────────────────────
  function _buildStatRows(rows, prefix) {
    const mount = document.getElementById(prefix + "stat-rows");
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
              ${isLabel ? `<div class="text-muted small">${_esc(item.label)}</div>` : ""}
              <div class="${isLabel ? "fw-semibold" : "fw-bold fs-5"}" id="${_esc(prefix + "stat-" + item.id)}">—</div>
              ${!isLabel ? `<div class="text-muted small">${_esc(item.label)}</div>` : ""}
            </div>
          </div>`;
        rowEl.appendChild(col);
      });
      mount.appendChild(rowEl);
    });
  }

  // ── Render all stat items ───────────────────────────────────────────────────
  function _renderStatRows(rowsCfg, filteredRows, prefix, ctx) {
    rowsCfg.forEach((row) => {
      row.items.forEach((item) => _renderStatItem(item, filteredRows, prefix, ctx));
    });
  }

  // ── Build and update weekly bucket map ─────────────────────────────────────
  function _buildBucketMap(rows, dateField, widx, tlMetric, tlField) {
    const map = new Map();
    for (const r of rows) {
      if (!r[dateField]) continue;
      const wi = widx.get(_weekStart(r[dateField]));
      if (wi === undefined) continue;
      const val = tlMetric === "sum" && tlField ? Number(r[tlField]) || 0 : 1;
      map.set(wi, (map.get(wi) || 0) + val);
    }
    return map;
  }

  // ── Filter rows to a date window ────────────────────────────────────────────
  function _filterByWindow(rows, dateField, startDate, endDate) {
    return rows.filter((r) => r[dateField] && r[dateField] >= startDate && r[dateField] <= endDate);
  }

  // ── Escape helper ───────────────────────────────────────────────────────────
  function _esc(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ── Drill-down helpers ─────────────────────────────────────────────────────

  // Array-aware key match (mirrors InsightsEngine groupBy logic).
  function _rowMatchesKey(row, field, key) {
    const v = row[field];
    if (Array.isArray(v)) return v.includes(key);
    return (v ?? "(none)") === key;
  }

  // Render one drill item as HTML. Uses entity.drillItem(row) when supplied,
  // otherwise falls back to name+date+stars with an optional modal link.
  function _drillItemHTML(row, idField, dateField, customRenderer) {
    if (customRenderer) return customRenderer(row);
    const name = _esc(String(row.name || row.title || "(unknown)"));
    const id = idField && row[idField] != null ? String(row[idField]) : null;
    const dateStr =
      dateField && row[dateField]
        ? `<span class="text-muted ms-2">${_esc(row[dateField])}</span>`
        : "";
    const r = row.rating;
    const stars =
      r && r > 0
        ? `<span class="ms-2">${"⭐".repeat(Math.floor(r))}${r % 1 >= 0.5 ? "½" : ""}</span>`
        : "";
    const inner = `${name}${dateStr}${stars}`;
    if (id)
      return `<a href="#" class="text-decoration-none" data-modal-id="${_esc(id)}">${inner}</a>`;
    return `<span>${inner}</span>`;
  }

  const _DRILL_PAGE_SIZE = 25;

  // Populate `panel` with the member rows for `group` using `drillCtx`.
  function _renderDrillPanel(group, drillCtx, panel, entity) {
    const { filteredRows, drillField, idField, dateField, activeMetric } = drillCtx;
    // Use entity.drillMatch when supplied (precise composite-key matching), else fall back
    // to the standard array-aware field match.
    let members = entity.drillMatch
      ? filteredRows.filter((r) => entity.drillMatch(r, group))
      : filteredRows.filter((r) => _rowMatchesKey(r, drillField, group.key));

    if (activeMetric === "avg") {
      members = members.slice().sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    } else if (dateField) {
      members = members.slice().sort((a, b) => {
        const ad = a[dateField] || "";
        const bd = b[dateField] || "";
        return bd.localeCompare(ad);
      });
    }

    if (!members.length) {
      panel.innerHTML = `<p class="text-muted small mb-0">No items found.</p>`;
      return;
    }

    // entity.drillRender replaces the whole panel body with an aggregated view.
    if (entity.drillRender) {
      panel.innerHTML = entity.drillRender(members, group);
      return;
    }

    function renderSlice(items) {
      panel.innerHTML = "";
      const list = document.createElement("ul");
      list.className = "list-unstyled mb-1 small";
      items.forEach((r) => {
        const li = document.createElement("li");
        li.className = "py-1 border-bottom";
        li.innerHTML = _drillItemHTML(r, idField, dateField, entity.drillItem);
        list.appendChild(li);
      });
      panel.appendChild(list);

      if (members.length > items.length) {
        const remaining = members.length - items.length;
        const showBtn = document.createElement("button");
        showBtn.type = "button";
        showBtn.className = "btn btn-sm btn-link p-0 text-muted";
        showBtn.textContent = `Show ${remaining} more`;
        showBtn.addEventListener("click", (e) => {
          e.stopPropagation(); // don't collapse the panel
          renderSlice(members);
        });
        panel.appendChild(showBtn);
      }
    }

    renderSlice(members.slice(0, _DRILL_PAGE_SIZE));
  }

  // ── Format month "YYYY-MM" → human readable ─────────────────────────────────
  function _fmtYYYYMM(yyyyMM) {
    const [y, m] = yyyyMM.split("-");
    return new Date(+y, +m - 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
  }

  // ── Render timeline chart ───────────────────────────────────────────────────
  function _renderTimeline(
    byBucket,
    WEEKS,
    minIdx,
    maxIdx,
    allByBucket,
    excludeYears,
    color,
    timelineLabel,
    prefix,
  ) {
    const container = document.getElementById(prefix + "timeline-chart");
    if (!container) return;
    const { labels, values, granularity, inWindowFlags } = InsightsChart.bucketByGranularity(
      WEEKS,
      byBucket,
      minIdx,
      maxIdx,
      allByBucket,
      excludeYears,
    );
    const headingEl = document.getElementById(prefix + "timeline-heading");
    if (headingEl) headingEl.textContent = `${timelineLabel} (${granularity})`;
    InsightsChart.barChart(`#${prefix}timeline-chart`, { labels, values, color, inWindowFlags });
  }

  // ── Render entity leaderboard list ─────────────────────────────────────────
  // drillCtx (optional): { filteredRows, drillField, idField, dateField }
  function _renderList(
    entity,
    groups,
    prefix,
    emptyLabel,
    visibleCount,
    SHOW_STEP,
    setVisibleCount,
    drillCtx,
    activeMetric,
  ) {
    const container = document.getElementById(prefix + "top-list");
    if (!container) return;
    container.innerHTML = "";

    if (!groups.length) {
      container.innerHTML = `<p class="text-muted">No ${_esc(emptyLabel)} in this window.</p>`;
      return;
    }

    const isAvg = activeMetric === "avg";
    const maxVal = isAvg ? (groups[0]?.avg ?? 1) : (groups[0]?.value ?? 1);
    const doShowBars = entity.showBars !== false;
    const fmt = isAvg ? null : entity.formatCount;
    const canDrill = !!(drillCtx?.drillField && drillCtx?.filteredRows?.length);

    groups.slice(0, visibleCount).forEach((group, i) => {
      const displayVal = isAvg ? (group.avg ?? 0) : group.value;
      const pct = maxVal > 0 ? Math.round((displayVal / maxVal) * 100) : 0;
      const countStr = fmt
        ? fmt(group, i)
        : isAvg
          ? `${group.avg != null ? group.avg.toFixed(2) : "—"}${i === 0 ? " avg ⭐" : ""}`
          : `${group.count.toLocaleString()}${i === 0 ? ` ${emptyLabel}` : ""}`;

      const wrapper = document.createElement("div");
      wrapper.className = "mb-2";

      const row = document.createElement("div");
      row.className = "d-flex align-items-start gap-2";
      if (canDrill) {
        row.style.cursor = "pointer";
        row.setAttribute("role", "button");
        row.setAttribute("aria-expanded", "false");
      }
      row.innerHTML = `
        <span class="text-muted" style="min-width:1.5rem;text-align:right">${i + 1}</span>
        <div class="flex-grow-1">
          <div class="d-flex justify-content-between align-items-start">
            <span class="fw-semibold">${_esc(String(group.label))}</span>
            <span class="d-flex align-items-center gap-1 text-muted ms-2 text-nowrap">
              <span>${_esc(countStr)}</span>
              ${canDrill ? `<span class="drill-chevron" aria-hidden="true" style="font-size:.7rem;transition:transform .15s">▶</span>` : ""}
            </span>
          </div>
          ${group.sub ? `<small class="text-muted">${_esc(String(group.sub))}</small>` : ""}
          ${doShowBars ? `<div class="progress mt-1" style="height:4px"><div class="progress-bar" style="width:${pct}%"></div></div>` : ""}
        </div>`;
      wrapper.appendChild(row);

      if (canDrill) {
        const panel = document.createElement("div");
        panel.className = "d-none";
        panel.style.cssText = "padding-left:calc(1.5rem + 0.5rem);margin-top:4px";
        wrapper.appendChild(panel);

        row.addEventListener("click", () => {
          const isOpen = row.getAttribute("aria-expanded") === "true";
          const chevron = row.querySelector(".drill-chevron");
          if (isOpen) {
            row.setAttribute("aria-expanded", "false");
            panel.classList.add("d-none");
            panel.innerHTML = "";
            if (chevron) chevron.style.transform = "";
          } else {
            row.setAttribute("aria-expanded", "true");
            panel.classList.remove("d-none");
            if (chevron) chevron.style.transform = "rotate(90deg)";
            _renderDrillPanel(group, drillCtx, panel, entity);
          }
        });
      }

      container.appendChild(wrapper);
    });

    if (visibleCount < groups.length) {
      const nextCount = Math.min(visibleCount + SHOW_STEP, groups.length);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-sm btn-outline-secondary mt-1";
      btn.textContent =
        nextCount === groups.length ? `Show all ${groups.length.toLocaleString()}` : "Show 10 more";
      btn.addEventListener("click", () => {
        setVisibleCount(nextCount);
        _renderList(
          entity,
          groups,
          prefix,
          emptyLabel,
          nextCount,
          SHOW_STEP,
          setVisibleCount,
          drillCtx,
          activeMetric,
        );
      });
      const wrap = document.createElement("div");
      wrap.style.paddingLeft = "calc(1.5rem + 0.5rem)";
      wrap.appendChild(btn);
      container.appendChild(wrap);
    }
  }

  // ── Render extra charts ─────────────────────────────────────────────────────
  function _renderExtraCharts(extraCharts, filteredRows, prefix, color) {
    const mount = document.getElementById(prefix + "extra-charts");
    if (!mount) return;
    mount.innerHTML = "";

    for (const chart of extraCharts) {
      let labels, values;

      if (chart.compute) {
        const data = chart.compute(filteredRows);
        if (!data) continue;
        labels = data.labels;
        values = data.values;
      } else if (chart.spec) {
        const agg = InsightsEngine.aggregate(filteredRows, chart.spec);
        if (agg.kind !== "groups") continue;
        labels = chart.labels || agg.groups.map((g) => String(g.label));
        values = agg.groups.map((g) => g.value);
      } else continue;

      if (!values || values.every((v) => v === 0)) {
        if (chart.emptyMessage) {
          const heading = document.createElement("h6");
          heading.className = "mt-4 mb-1 fw-bold";
          heading.textContent = chart.title;
          mount.appendChild(heading);
          const p = document.createElement("p");
          p.className = "text-muted small";
          p.textContent = chart.emptyMessage;
          mount.appendChild(p);
        }
        continue;
      }

      const chartId = prefix + (chart.id || "extra") + "-chart";
      const heading = document.createElement("h6");
      heading.className = "mt-4 mb-1 fw-bold";
      heading.textContent = chart.title;
      mount.appendChild(heading);

      const div = document.createElement("div");
      div.id = chartId;
      div.style.cssText = "width:100%;min-height:220px";
      mount.appendChild(div);

      if (chart.type === "donut") {
        InsightsChart.donutChart("#" + chartId, { labels, values });
      } else {
        InsightsChart.barChart("#" + chartId, {
          labels,
          values,
          color: chart.color || color,
        });
      }
    }
  }

  // ── Initialize calendar ─────────────────────────────────────────────────────
  function _initCalendar(calCfg, rows, dateField) {
    if (!calCfg || !rows.length) return;
    const calData = InsightsEngine.aggregate(rows, { calendar: true, field: dateField });

    if (calCfg.type === "fullCalendar") {
      const tabBtn = document.getElementById(calCfg.tabId);
      if (!tabBtn) return;
      let rendered = false;
      tabBtn.addEventListener("shown.bs.tab", () => {
        if (rendered) return;
        rendered = true;
        _renderFullCalendar(calCfg, calData);
      });
    } else {
      // heatmap (default)
      InsightsHeatmap.init({
        container: calCfg.containerId ? "#" + calCfg.containerId : null,
        navPrev: calCfg.navPrevId ? "#" + calCfg.navPrevId : null,
        navYear: calCfg.navYearId ? "#" + calCfg.navYearId : null,
        navNext: calCfg.navNextId ? "#" + calCfg.navNextId : null,
        items: calData.items || {},
        popoverContent: calCfg.popoverContent,
        countLevel: calCfg.countLevel,
      });
    }
  }

  function _renderFullCalendar(cfg, calData) {
    const el = document.getElementById(cfg.calElId);
    if (!el) return;

    const fmt = cfg.formatEvent || ((row) => ({ title: "1 item", start: row.date || row.week }));
    const events = [];
    for (const [, rowItems] of Object.entries(calData.items)) {
      for (const row of rowItems) {
        events.push(fmt(row));
      }
    }

    const allDates = Object.keys(calData.items).sort().reverse();
    const initialDate = allDates[0] || new Date().toISOString().slice(0, 10);

    function doRender() {
      if (typeof FullCalendar === "undefined") return;
      const cal = new FullCalendar.Calendar(el, {
        initialDate,
        initialView: "dayGridMonth",
        events,
      });
      cal.render();
    }

    if (typeof FullCalendar !== "undefined") {
      doRender();
    } else {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/fullcalendar@6.1.15/index.global.min.js";
      script.onload = doRender;
      document.head.appendChild(script);
    }
  }

  // ── Main init ───────────────────────────────────────────────────────────────
  function init(cfg) {
    const {
      prefix = "",
      color = "--type-steps",
      defaultEntity,
      emptyLabel = "items",
      timelineLabel = "Activity over time",
      rows: rowsCfg = [],
      entities = [],
      entityMetrics = [],
      sortToggle = false,
      dateless = false,
      excludeYears = [],
      dataset,
      load,
      dateField = "date",
      timeline: timelineCfg = {},
      calendar: calendarCfg = null,
      extraCharts: extraChartsCfg = [],
      onWindowChange: onWindowChangeCb = null,
    } = cfg;

    const tlMetric = timelineCfg.metric || "count";
    const tlField = timelineCfg.field || null;

    const SHOW_STEP = 10;

    // ── Per-instance state ──────────────────────────────────────────────────
    let ROWS = [];
    let WEEKS = [];
    let widx = new Map();
    let allByBucket = new Map();
    let minBucketIdx = 0;
    let maxBucketIdx = 0;
    let activeEntity = defaultEntity ?? entities[0]?.id ?? "";
    let activeMetric = entityMetrics[0]?.value ?? "count";
    let activeSortDir = "desc";
    let visibleCount = SHOW_STEP;
    let lastGroups = [];

    function setVisibleCount(n) {
      visibleCount = n;
    }

    // ── Boot ────────────────────────────────────────────────────────────────
    async function boot() {
      // Resolve rows
      let lastUpdated = null;
      try {
        if (load) {
          const result = await load();
          if (Array.isArray(result)) {
            ROWS = result;
          } else if (result && Array.isArray(result.rows)) {
            ROWS = result.rows;
            if (result.lastUpdated) lastUpdated = result.lastUpdated;
          } else if (result && result.rows == null) {
            // legacy: load returned {weeks, allByBucket, lastUpdated} — ignore, rows from dataset
            if (result.lastUpdated) lastUpdated = result.lastUpdated;
            ROWS = [];
          }
        }
        if (!ROWS.length && dataset) {
          ROWS = window.INSIGHTS_DATASETS?.[dataset]?.rows || [];
        }
      } catch {
        const loadingEl = document.getElementById(prefix + "insights-loading");
        if (loadingEl) loadingEl.textContent = "⚠️ Could not load insights data.";
        return;
      }

      if (lastUpdated) {
        const dateEl = document.getElementById("last-updated-date");
        if (dateEl) dateEl.textContent = lastUpdated;
      }

      // Show content, hide loading indicator
      const loadingEl = document.getElementById(prefix + "insights-loading");
      if (loadingEl) {
        loadingEl.style.display = "none";
        const contentEl = document.getElementById(prefix + "insights-content");
        if (contentEl) contentEl.style.display = "";
      }

      // Build time-series data structures
      if (!dateless && ROWS.length) {
        const weekSet = new Set();
        for (const r of ROWS) {
          if (r[dateField]) weekSet.add(_weekStart(r[dateField]));
        }
        WEEKS = [...weekSet].sort();
        widx = new Map(WEEKS.map((w, i) => [w, i]));
        allByBucket = _buildBucketMap(ROWS, dateField, widx, tlMetric, tlField);
      }

      // Initialize calendar (uses full ROWS, not windowed)
      if (calendarCfg) _initCalendar(calendarCfg, ROWS, dateField);

      _buildStatRows(rowsCfg, prefix);
      _buildEntityToggle();

      if (dateless) {
        renderDateless();
      } else {
        buildPresets();
        buildYearPresets();
        _restoreWindowFromURL();
        bindCustomRange();
      }
    }

    // ── Dateless render ─────────────────────────────────────────────────────
    function renderDateless() {
      const ctx = { weekCount: null };
      _renderStatRows(rowsCfg, ROWS, prefix, ctx);
      renderEntityList(ROWS);
      _renderExtraCharts(extraChartsCfg, ROWS, prefix, color);
      if (onWindowChangeCb) onWindowChangeCb(null, null);
    }

    // ── Window change ───────────────────────────────────────────────────────
    function setWindow(lo, hi) {
      minBucketIdx = lo;
      maxBucketIdx = hi;
      visibleCount = SHOW_STEP;
      highlightActivePreset();
      updateCustomInputs();
      render();
      _syncRangeToURL();
    }

    function render() {
      if (!WEEKS.length) return;
      const startDate = WEEKS[minBucketIdx];
      const endDate = _endOfWeek(WEEKS[maxBucketIdx]);
      const filteredRows = _filterByWindow(ROWS, dateField, startDate, endDate);
      const byBucket = _buildBucketMap(filteredRows, dateField, widx, tlMetric, tlField);
      const weekCount = maxBucketIdx - minBucketIdx + 1;
      const ctx = { weekCount, startDate, endDate };

      _renderStatRows(rowsCfg, filteredRows, prefix, ctx);
      renderEntityList(filteredRows);
      _renderTimeline(
        byBucket,
        WEEKS,
        minBucketIdx,
        maxBucketIdx,
        allByBucket,
        excludeYears,
        color,
        timelineLabel,
        prefix,
      );
      _renderExtraCharts(extraChartsCfg, filteredRows, prefix, color);
      if (onWindowChangeCb) onWindowChangeCb(startDate, endDate);
    }

    // ── Entity leaderboard ──────────────────────────────────────────────────
    function _reRenderEntityList() {
      visibleCount = SHOW_STEP;
      const startDate = dateless ? null : WEEKS[minBucketIdx];
      const endDate = dateless ? null : _endOfWeek(WEEKS[maxBucketIdx]);
      const filteredRows = dateless ? ROWS : _filterByWindow(ROWS, dateField, startDate, endDate);
      renderEntityList(filteredRows);
    }

    function _buildEntityToggle() {
      const bar = document.getElementById(prefix + "entity-bar");
      if (!bar) return;

      if (entities.length > 1) {
        const sel = document.createElement("select");
        sel.className = "form-select form-select-sm w-auto";
        sel.setAttribute("aria-label", "Explore by");
        entities.forEach((ent) => {
          const opt = document.createElement("option");
          opt.value = ent.id;
          opt.textContent = ent.label;
          if (ent.id === activeEntity) opt.selected = true;
          sel.appendChild(opt);
        });
        sel.addEventListener("change", () => {
          activeEntity = sel.value;
          _reRenderEntityList();
        });
        bar.appendChild(sel);
      }

      if (entityMetrics.length > 1) {
        const metricSel = document.createElement("select");
        metricSel.className = "form-select form-select-sm w-auto";
        metricSel.setAttribute("aria-label", "Metric");
        entityMetrics.forEach(({ value, label }) => {
          const opt = document.createElement("option");
          opt.value = value;
          opt.textContent = label;
          if (value === activeMetric) opt.selected = true;
          metricSel.appendChild(opt);
        });
        metricSel.addEventListener("change", () => {
          activeMetric = metricSel.value;
          _reRenderEntityList();
        });
        bar.appendChild(metricSel);
      }

      if (sortToggle) {
        const sortSel = document.createElement("select");
        sortSel.className = "form-select form-select-sm w-auto";
        sortSel.setAttribute("aria-label", "Sort order");
        [
          { value: "desc", label: "Highest to lowest" },
          { value: "asc",  label: "Lowest to highest" },
        ].forEach(({ value, label }) => {
          const opt = document.createElement("option");
          opt.value = value;
          opt.textContent = label;
          if (value === activeSortDir) opt.selected = true;
          sortSel.appendChild(opt);
        });
        sortSel.addEventListener("change", () => {
          activeSortDir = sortSel.value;
          _reRenderEntityList();
        });
        bar.appendChild(sortSel);
      }
    }

    function renderEntityList(filteredRows) {
      const entity = entities.find((e) => e.id === activeEntity);
      const container = document.getElementById(prefix + "top-list");
      if (!container) return;

      if (!entities.length) {
        container.innerHTML = "";
        return;
      }

      if (!entity) {
        container.innerHTML = `<p class="text-muted">No data.</p>`;
        return;
      }

      let groups;
      if (entity.compute) {
        groups = entity.compute(filteredRows) || [];
        if (activeSortDir === "asc") groups = [...groups].reverse();
      } else if (entity.spec) {
        const spec = {
          ...entity.spec,
          sort: { by: entity.spec?.sort?.by ?? "value", dir: activeSortDir },
        };
        const agg = InsightsEngine.aggregate(filteredRows, spec);
        groups = agg.groups || [];
      } else {
        groups = [];
      }

      if (activeMetric === "avg") {
        const dir = activeSortDir === "asc" ? 1 : -1;
        groups = groups
          .filter((g) => g.avg != null && g.count >= 2)
          .sort((a, b) => dir * ((a.avg ?? 0) - (b.avg ?? 0)));
      }

      // Recency tiebreaker: within equal-valued groups, most recently watched first
      if (!dateless) {
        const byField = entity.spec?.groupBy || entity.drillField;
        if (byField) {
          const maxDates = new Map();
          for (const row of filteredRows) {
            const rawVal = row[byField];
            const keys = Array.isArray(rawVal) ? rawVal : [rawVal];
            const d = row[dateField];
            if (!d) continue;
            for (const k of keys) {
              if (k == null) continue;
              if (!maxDates.has(k) || d > maxDates.get(k)) maxDates.set(k, d);
            }
          }
          groups = [...groups].sort((a, b) => {
            const av = activeMetric === "avg" ? (a.avg ?? 0) : a.value;
            const bv = activeMetric === "avg" ? (b.avg ?? 0) : b.value;
            if (av !== bv) return 0;
            const da = maxDates.get(a.key) ?? "";
            const db = maxDates.get(b.key) ?? "";
            return db.localeCompare(da);
          });
        }
      }

      lastGroups = groups;
      const drillField = entity.drillField || entity.spec?.groupBy || null;
      const drillCtx = drillField ? { filteredRows, drillField, idField: "id", dateField, activeMetric } : null;
      _renderList(
        entity,
        groups,
        prefix,
        emptyLabel,
        visibleCount,
        SHOW_STEP,
        setVisibleCount,
        drillCtx,
        activeMetric,
      );
    }

    // ── Presets ─────────────────────────────────────────────────────────────
    function buildPresets() {
      const now = new Date();
      const d30Str = new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
      const d365Str = new Date(now.getTime() - 365 * 86_400_000).toISOString().slice(0, 10);
      const d1JanStr = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);

      const on = (suffix, handler) => {
        const btn = document.getElementById(prefix + suffix);
        if (btn) btn.addEventListener("click", handler);
      };

      on("btn-alltime", () => setWindow(0, WEEKS.length - 1));
      on("btn-last30", () => {
        const lo = WEEKS.findIndex((w) => w >= d30Str);
        if (lo !== -1) setWindow(lo, WEEKS.length - 1);
      });
      on("btn-thisyear", () => {
        const lo = WEEKS.findIndex((w) => w >= d1JanStr);
        if (lo !== -1) setWindow(lo, WEEKS.length - 1);
      });
      on("btn-last12", () => {
        const lo = WEEKS.findIndex((w) => w >= d365Str);
        if (lo !== -1) setWindow(lo, WEEKS.length - 1);
      });
    }

    function buildYearPresets() {
      const container = document.getElementById(prefix + "year-buttons");
      if (!container) return;
      const years = [...new Set(WEEKS.map((w) => w.slice(0, 4)))].sort().reverse();
      years.forEach((year) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `btn btn-sm btn-outline-secondary me-1 mb-1 ${prefix}preset-btn`;
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

    function _describeWindow(lo, hi) {
      const now = new Date();
      const d30Str = new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
      const d365Str = new Date(now.getTime() - 365 * 86_400_000).toISOString().slice(0, 10);
      const d1JanStr = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);

      if (lo === 0 && hi === WEEKS.length - 1) return { key: "alltime" };
      if (hi === WEEKS.length - 1 && WEEKS[lo] >= d30Str) return { key: "last30" };
      if (hi === WEEKS.length - 1 && WEEKS[lo] >= d1JanStr) return { key: "thisyear" };
      if (hi === WEEKS.length - 1 && WEEKS[lo] >= d365Str) return { key: "last12" };

      const years = [...new Set(WEEKS.slice(lo, hi + 1).map((w) => w.slice(0, 4)))];
      if (years.length === 1) return { key: years[0] };

      return { key: "custom", from: WEEKS[lo].slice(0, 7), to: WEEKS[hi].slice(0, 7) };
    }

    function highlightActivePreset() {
      document.querySelectorAll(`.${prefix}preset-btn`).forEach((b) => {
        b.classList.remove("btn-secondary");
        b.classList.add("btn-outline-secondary");
      });
      const desc = _describeWindow(minBucketIdx, maxBucketIdx);
      if (desc.key === "alltime") _activatePresetBtn("btn-alltime");
      else if (desc.key === "last30") _activatePresetBtn("btn-last30");
      else if (desc.key === "thisyear") _activatePresetBtn("btn-thisyear");
      else if (desc.key === "last12") _activatePresetBtn("btn-last12");
      else if (/^\d{4}$/.test(desc.key)) {
        const yearBtn = document.querySelector(`#${prefix}year-buttons [data-year="${desc.key}"]`);
        if (yearBtn) _activateBtn(yearBtn);
      }
    }

    function _syncRangeToURL() {
      if (typeof DataUrlState === "undefined") return;
      const desc = _describeWindow(minBucketIdx, maxBucketIdx);
      DataUrlState.setParam("range", desc.key);
      if (desc.key === "custom") {
        DataUrlState.setParam("from", desc.from);
        DataUrlState.setParam("to", desc.to);
      } else {
        DataUrlState.deleteParam("from");
        DataUrlState.deleteParam("to");
      }
    }

    function _restoreWindowFromURL() {
      if (!WEEKS.length) return;
      if (typeof DataUrlState === "undefined") {
        setWindow(0, WEEKS.length - 1);
        return;
      }
      const params = DataUrlState.getParams();
      const range = params.get("range");

      if (!range || range === "alltime") {
        setWindow(0, WEEKS.length - 1);
        return;
      }

      const now = new Date();
      const d30Str = new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
      const d365Str = new Date(now.getTime() - 365 * 86_400_000).toISOString().slice(0, 10);
      const d1JanStr = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);

      let lo = -1,
        hi = WEEKS.length - 1;

      if (range === "last30") {
        lo = WEEKS.findIndex((w) => w >= d30Str);
      } else if (range === "thisyear") {
        lo = WEEKS.findIndex((w) => w >= d1JanStr);
      } else if (range === "last12") {
        lo = WEEKS.findIndex((w) => w >= d365Str);
      } else if (/^\d{4}$/.test(range)) {
        lo = WEEKS.findIndex((w) => w.slice(0, 4) === range);
        hi = WEEKS.reduce((acc, w, i) => (w.slice(0, 4) === range ? i : acc), lo);
      } else if (range === "custom") {
        const from = params.get("from");
        const to = params.get("to");
        if (from && to) {
          lo = WEEKS.findIndex((w) => w >= from + "-01");
          if (lo !== -1) {
            const endNext = new Date(to + "-01");
            endNext.setMonth(endNext.getMonth() + 1);
            hi = WEEKS.reduce(
              (acc, w, i) => (w < endNext.toISOString().slice(0, 10) ? i : acc),
              lo,
            );
          }
        }
      }

      setWindow(lo !== -1 ? lo : 0, hi);
    }

    function _activatePresetBtn(suffix) {
      _activateBtn(document.getElementById(prefix + suffix));
    }
    function _activateBtn(btn) {
      if (!btn) return;
      btn.classList.remove("btn-outline-secondary");
      btn.classList.add("btn-secondary");
    }

    // ── Custom range ─────────────────────────────────────────────────────────
    function bindCustomRange() {
      const startEl = document.getElementById(prefix + "range-start");
      const endEl = document.getElementById(prefix + "range-end");
      if (!startEl || !endEl || !WEEKS.length) return;

      const firstMonth = WEEKS[0].slice(0, 7);
      const lastMonth = WEEKS[WEEKS.length - 1].slice(0, 7);
      startEl.min = endEl.min = firstMonth;
      startEl.max = endEl.max = lastMonth;

      function applyCustom() {
        const s = startEl.value,
          e = endEl.value;
        if (!s || !e || s > e) return;
        const lo = WEEKS.findIndex((w) => w >= s + "-01");
        if (lo === -1) return;
        const endNext = new Date(e + "-01");
        endNext.setMonth(endNext.getMonth() + 1);
        const hi = WEEKS.reduce(
          (acc, w, i) => (w < endNext.toISOString().slice(0, 10) ? i : acc),
          lo,
        );
        setWindow(lo, hi);
      }

      startEl.addEventListener("change", applyCustom);
      endEl.addEventListener("change", applyCustom);
    }

    function updateCustomInputs() {
      if (!WEEKS.length) return;
      const startEl = document.getElementById(prefix + "range-start");
      const endEl = document.getElementById(prefix + "range-end");
      if (startEl) startEl.value = WEEKS[minBucketIdx].slice(0, 7);
      if (endEl) endEl.value = WEEKS[maxBucketIdx].slice(0, 7);
    }

    // ── Kick off ─────────────────────────────────────────────────────────────
    boot();
  }

  // ── Recent list helper (unchanged from v1) ─────────────────────────────────
  function initRecentList({
    listSelector = ".recent-item",
    buttonId = "load-more-btn",
    batchSize = 5,
  } = {}) {
    const items = Array.from(document.querySelectorAll(listSelector));
    const btn = document.getElementById(buttonId);
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
