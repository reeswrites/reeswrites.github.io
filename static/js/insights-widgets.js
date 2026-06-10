"use strict";

/**
 * Widget type registry for custom insight widgets.
 *
 * InsightsWidgets.register(type, descriptor)
 * InsightsWidgets.get(type)   → descriptor
 * InsightsWidgets.types()     → [{ id, label, icon }]
 *
 * Descriptor shape:
 *   label, icon, defaultConfig, configSchema,
 *   buildSpec(config, dataset) → engine spec,
 *   render(container, aggResult, config, ctx)
 */
const InsightsWidgets = (() => {
  "use strict";

  const _registry = new Map();

  function register(type, descriptor) {
    _registry.set(type, descriptor);
  }

  function get(type) {
    return _registry.get(type);
  }

  function types() {
    return [..._registry.entries()].map(([id, d]) => ({ id, label: d.label, icon: d.icon }));
  }

  // ── Shared render helpers ──────────────────────────────────────────────────

  function _esc(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ── Leaderboard widget ─────────────────────────────────────────────────────

  register("leaderboard", {
    label: "Leaderboard",
    icon: "🏆",

    defaultConfig: {
      groupBy: null,
      metric: "count",
      field: null,
      filter: [],
      sort: { by: "value", dir: "desc" },
      limit: 10,
      showBars: true,
    },

    configSchema: [
      { id: "groupBy", control: "select", label: "Group by", source: "dimensions" },
      {
        id: "metric",
        control: "segmented",
        label: "Metric",
        options: [
          { v: "count", l: "Count" },
          { v: "avg", l: "Avg" },
          { v: "sum", l: "Sum" },
          { v: "max", l: "Max" },
        ],
      },
      {
        id: "field",
        control: "select",
        label: "Of field",
        source: "measures",
        showWhen: (c) => c.metric !== "count",
      },
      { id: "filter", control: "facetFilter", label: "Filters", source: "dimensions" },
      { id: "limit", control: "slider", label: "Show top", min: 3, max: 25, step: 1 },
      { id: "showBars", control: "toggle", label: "Progress bars" },
    ],

    buildSpec(config, _dataset) {
      return {
        filter: config.filter || [],
        groupBy: config.groupBy || null,
        metric: config.metric || "count",
        field: config.metric !== "count" ? config.field || null : null,
        sort: config.sort || { by: "value", dir: "desc" },
        limit: config.limit || 10,
      };
    },

    render(container, aggResult, config) {
      container.innerHTML = "";

      if (!aggResult || aggResult.kind !== "groups" || !aggResult.groups.length) {
        container.innerHTML = '<p class="text-muted small mb-0">No data.</p>';
        return;
      }

      const { groups } = aggResult;
      const maxValue = groups[0]?.value ?? 1;
      const showBars = config.showBars !== false;
      const isCount = !config.metric || config.metric === "count";

      groups.forEach((item, i) => {
        const pct = maxValue > 0 ? Math.round((item.value / maxValue) * 100) : 0;
        const dispVal =
          typeof item.value === "number"
            ? Number.isInteger(item.value)
              ? item.value.toLocaleString()
              : item.value.toFixed(2)
            : String(item.value ?? "");
        const countStr = isCount
          ? `${item.count.toLocaleString()}${i === 0 ? " total" : ""}`
          : dispVal;

        const row = document.createElement("div");
        row.className = "d-flex align-items-start gap-2 mb-2";
        row.innerHTML = `
          <span class="text-muted" style="min-width:1.5rem;text-align:right">${i + 1}</span>
          <div class="flex-grow-1">
            <div class="d-flex justify-content-between">
              <span class="fw-semibold">${_esc(item.label)}</span>
              <span class="text-muted ms-2 text-nowrap">${_esc(countStr)}</span>
            </div>
            ${item.sub ? `<small class="text-muted">${_esc(item.sub)}</small>` : ""}
            ${showBars ? `<div class="progress mt-1" style="height:4px"><div class="progress-bar" style="width:${pct}%"></div></div>` : ""}
          </div>`;
        container.appendChild(row);
      });
    },
  });

  // ── Bar chart widget ───────────────────────────────────────────────────────

  register("barChart", {
    label: "Bar chart",
    icon: "📊",

    defaultConfig: {
      mode: "time",
      groupBy: null,
      metric: "count",
      field: null,
      limit: 10,
      filter: [],
    },

    configSchema: [
      {
        id: "mode",
        control: "segmented",
        label: "Mode",
        options: [
          { v: "time", l: "Over time" },
          { v: "category", l: "By category" },
        ],
      },
      {
        id: "groupBy",
        control: "select",
        label: "Group by",
        source: "dimensions",
        showWhen: (c) => c.mode === "category",
      },
      {
        id: "metric",
        control: "segmented",
        label: "Metric",
        options: [
          { v: "count", l: "Count" },
          { v: "avg", l: "Avg" },
          { v: "sum", l: "Sum" },
          { v: "max", l: "Max" },
        ],
        showWhen: (c) => c.mode === "category",
      },
      {
        id: "field",
        control: "select",
        label: "Of field",
        source: "measures",
        showWhen: (c) => c.mode === "category" && c.metric !== "count",
      },
      {
        id: "limit",
        control: "slider",
        label: "Show top",
        min: 3,
        max: 25,
        step: 1,
        showWhen: (c) => c.mode === "category",
      },
      { id: "filter", control: "facetFilter", label: "Filters", source: "dimensions" },
    ],

    buildSpec(config, dataset) {
      if (config.mode === "category") {
        return {
          filter: config.filter || [],
          groupBy: config.groupBy || null,
          metric: config.metric || "count",
          field: config.metric !== "count" ? config.field || null : null,
          sort: { by: "value", dir: "desc" },
          limit: config.limit || 10,
        };
      }
      // Over-time: find first date field
      const dateField = dataset.fields.find((f) => f.type === "date");
      return {
        filter: config.filter || [],
        timeBucket: "auto",
        field: dateField?.key || "date",
      };
    },

    render(container, aggResult, config, ctx) {
      container.innerHTML = "";
      if (!aggResult) {
        container.innerHTML = '<p class="text-muted small">No data.</p>';
        return;
      }

      let labels, values, inWindowFlags;

      if (aggResult.kind === "series") {
        ({ labels, values, inWindowFlags } = aggResult);
      } else if (aggResult.kind === "groups") {
        labels = aggResult.groups.map((g) => String(g.label));
        values = aggResult.groups.map((g) => g.value);
        inWindowFlags = null;
      } else {
        container.innerHTML = '<p class="text-muted small">No data.</p>';
        return;
      }

      if (!labels.length) {
        container.innerHTML = '<p class="text-muted small">No data.</p>';
        return;
      }

      const id = (ctx?.idBase || "widget") + "-chart";
      const div = document.createElement("div");
      div.id = id;
      div.style.cssText = "width:100%;min-height:220px";
      container.appendChild(div);
      InsightsChart.barChart("#" + id, {
        labels,
        values,
        color: ctx?.color || "#0d6efd",
        inWindowFlags,
      });
    },
  });

  // ── Heatmap widget ─────────────────────────────────────────────────────────

  register("heatmap", {
    label: "Heatmap",
    icon: "📅",

    defaultConfig: {
      filter: [],
      // Not exposed in UI — set programmatically for rich dashboard calendars:
      popoverContent: null, // (dateStr, items) => html string
      countLevel: null, // (n) => 0..4
    },

    configSchema: [
      { id: "filter", control: "facetFilter", label: "Filters", source: "dimensions" },
    ],

    buildSpec(config, dataset) {
      const dateField = dataset.fields.find((f) => f.type === "date");
      return {
        filter: config.filter || [],
        calendar: true,
        field: dateField?.key || "date",
      };
    },

    render(container, aggResult, config) {
      container.innerHTML = "";
      if (!aggResult || aggResult.kind !== "calendar") {
        container.innerHTML = '<p class="text-muted small">No data.</p>';
        return;
      }
      if (!Object.keys(aggResult.items).length) {
        container.innerHTML = '<p class="text-muted small">No dated items.</p>';
        return;
      }
      InsightsHeatmap.init({
        container,
        items: aggResult.items,
        popoverContent: config.popoverContent || null,
        countLevel: config.countLevel || null,
      });
    },
  });

  // ── Full calendar widget ────────────────────────────────────────────────────

  register("fullCalendar", {
    label: "Calendar",
    icon: "🗓️",

    defaultConfig: {
      filter: [],
      // Not exposed in UI — set programmatically:
      formatEvent: null, // (row) => { title, start }
    },

    configSchema: [
      { id: "filter", control: "facetFilter", label: "Filters", source: "dimensions" },
    ],

    buildSpec(config, dataset) {
      const dateField = dataset.fields.find((f) => f.type === "date");
      return {
        filter: config.filter || [],
        calendar: true,
        field: dateField?.key || "date",
      };
    },

    render(container, aggResult, config) {
      container.innerHTML = "";
      if (!aggResult || aggResult.kind !== "calendar") {
        container.innerHTML = '<p class="text-muted small">No data.</p>';
        return;
      }
      if (!Object.keys(aggResult.items).length) {
        container.innerHTML = '<p class="text-muted small">No dated items.</p>';
        return;
      }

      const fmt =
        config.formatEvent ||
        ((row) => ({
          title: "1 item",
          start: row.date || row.week || Object.keys(aggResult.items)[0],
        }));

      const events = [];
      for (const rowItems of Object.values(aggResult.items)) {
        for (const row of rowItems) {
          events.push(fmt(row));
        }
      }

      const allDates = Object.keys(aggResult.items).sort().reverse();
      const initialDate = allDates[0] || new Date().toISOString().slice(0, 10);

      function doRender() {
        if (typeof FullCalendar === "undefined") return;
        const cal = new FullCalendar.Calendar(container, {
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
    },
  });

  // ── Stat card widget ───────────────────────────────────────────────────────

  register("statCard", {
    label: "Stat card",
    icon: "🔢",

    defaultConfig: {
      metric: "count",
      field: null,
      filter: [],
    },

    configSchema: [
      {
        id: "metric",
        control: "segmented",
        label: "Metric",
        options: [
          { v: "count", l: "Count" },
          { v: "distinct", l: "Distinct" },
          { v: "avg", l: "Avg" },
          { v: "sum", l: "Sum" },
          { v: "min", l: "Min" },
          { v: "max", l: "Max" },
        ],
      },
      {
        id: "field",
        control: "select",
        label: "Of field",
        source: "measures",
        showWhen: (c) => c.metric !== "count",
      },
      { id: "filter", control: "facetFilter", label: "Filters", source: "dimensions" },
    ],

    buildSpec(config) {
      return {
        filter: config.filter || [],
        metric: config.metric || "count",
        field: config.metric !== "count" ? config.field || null : null,
      };
    },

    render(container, aggResult, config) {
      container.innerHTML = "";
      if (!aggResult || aggResult.kind !== "scalar") {
        container.innerHTML = '<p class="text-muted small">No data.</p>';
        return;
      }
      const val = aggResult.value;
      const dispVal =
        typeof val === "number"
          ? Number.isInteger(val)
            ? val.toLocaleString()
            : val.toFixed(2)
          : String(val ?? "—");
      const metric = config.metric || "count";
      const capLabel = metric.charAt(0).toUpperCase() + metric.slice(1);
      container.innerHTML = `
        <div class="text-center py-3">
          <div class="display-5 fw-bold">${_esc(dispVal)}</div>
          <div class="text-muted small mt-1">${_esc(capLabel)}</div>
        </div>`;
    },
  });

  // ── Donut widget ───────────────────────────────────────────────────────────

  register("donut", {
    label: "Donut",
    icon: "🍩",

    defaultConfig: {
      groupBy: null,
      limit: 8,
      filter: [],
    },

    configSchema: [
      { id: "groupBy", control: "select", label: "Group by", source: "dimensions" },
      { id: "limit", control: "slider", label: "Show top", min: 2, max: 15, step: 1 },
      { id: "filter", control: "facetFilter", label: "Filters", source: "dimensions" },
    ],

    buildSpec(config) {
      return {
        filter: config.filter || [],
        groupBy: config.groupBy || null,
        metric: "count",
        sort: { by: "value", dir: "desc" },
        limit: config.limit || 8,
      };
    },

    render(container, aggResult, _config, ctx) {
      container.innerHTML = "";
      if (!aggResult || aggResult.kind !== "groups" || !aggResult.groups.length) {
        container.innerHTML = '<p class="text-muted small">No data.</p>';
        return;
      }
      const labels = aggResult.groups.map((g) => String(g.label));
      const values = aggResult.groups.map((g) => g.value);
      const id = (ctx?.idBase || "widget") + "-chart";
      const div = document.createElement("div");
      div.id = id;
      div.style.cssText = "width:100%;min-height:300px";
      container.appendChild(div);
      InsightsChart.donutChart("#" + id, { labels, values });
    },
  });

  return { register, get, types };
})();
