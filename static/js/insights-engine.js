"use strict";

/**
 * Pure aggregation engine for custom insight widgets.
 *
 * InsightsEngine.aggregate(rows, spec) → result
 *
 * Spec shape:
 *   filter:     [{ field, op, value }]  op: eq|in|between|gte|lte|contains
 *   groupBy:    string | null
 *   metric:     "count"|"sum"|"avg"|"min"|"max"
 *   field:      string | null            required unless metric==="count"
 *   timeBucket: null|"auto"|"week"|"month"|"year"
 *   calendar:   boolean                  if true, returns kind:"calendar"
 *   fillSteps:  { min, max, step } | null  zero-fill numeric groupBy buckets in order
 *   sort:       { by:"value"|"key", dir:"asc"|"desc" }
 *   limit:      number | null
 *
 * Return shapes:
 *   groupBy set, no timeBucket → { kind:"groups", groups:[{key,label,sub,value,count,avg}], total }
 *   timeBucket set             → { kind:"series", labels, values, granularity, inWindowFlags }
 *   calendar:true              → { kind:"calendar", byDate:{date:count}, items:{date:[row]}, minYear, maxYear }
 *   groupBy null, no timeBucket→ { kind:"scalar", value }
 */
const InsightsEngine = (() => {
  "use strict";

  function _weekStart(dateStr) {
    const d = new Date(dateStr + "T12:00:00");
    const day = d.getDay();
    d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    return d.toISOString().slice(0, 10);
  }

  function _buildWeekIndex(rows, dateField) {
    const weekSet = new Set();
    for (const row of rows) {
      if (row[dateField]) weekSet.add(_weekStart(row[dateField]));
    }
    const weeks = [...weekSet].sort();
    const widx = new Map(weeks.map((w, i) => [w, i]));
    return { weeks, widx };
  }

  function _passes(row, filter) {
    for (const { field, op, value } of filter) {
      const v = row[field];
      switch (op) {
        case "eq":
          if (v !== value) return false;
          break;
        case "in":
          if (!Array.isArray(value) || !value.includes(v)) return false;
          break;
        case "between":
          if (v < value[0] || v > value[1]) return false;
          break;
        case "gte":
          if (v < value) return false;
          break;
        case "lte":
          if (v > value) return false;
          break;
        case "contains":
          if (!String(v).toLowerCase().includes(String(value).toLowerCase())) return false;
          break;
      }
    }
    return true;
  }

  function _metric(metric, field, rows) {
    if (metric === "count") return rows.length;
    const nums = rows.map((r) => r[field]).filter((v) => typeof v === "number" && !isNaN(v));
    if (!nums.length) return 0;
    if (metric === "sum") return nums.reduce((a, b) => a + b, 0);
    if (metric === "avg") return nums.reduce((a, b) => a + b, 0) / nums.length;
    if (metric === "min") return Math.min(...nums);
    if (metric === "max") return Math.max(...nums);
    return 0;
  }

  function aggregate(rows, spec) {
    const {
      filter = [],
      groupBy = null,
      metric = "count",
      field = null,
      timeBucket = null,
      calendar = false,
      fillSteps = null,
      sort = { by: "value", dir: "desc" },
      limit = null,
    } = spec;

    const filtered = filter.length ? rows.filter((r) => _passes(r, filter)) : rows;

    // ── Calendar heat-map ─────────────────────────────────────────────────────
    if (calendar) {
      const dateField = field || "date";
      const byDate = {};
      const items = {};
      for (const row of filtered) {
        const ds = row[dateField] ? String(row[dateField]).slice(0, 10) : null;
        if (!ds) continue;
        byDate[ds] = (byDate[ds] || 0) + 1;
        if (!items[ds]) items[ds] = [];
        items[ds].push(row);
      }
      const allDates = Object.keys(byDate).sort();
      const minYear = allDates.length
        ? parseInt(allDates[0].slice(0, 4), 10)
        : new Date().getFullYear();
      const maxYear = allDates.length
        ? parseInt(allDates[allDates.length - 1].slice(0, 4), 10)
        : new Date().getFullYear();
      return { kind: "calendar", byDate, items, minYear, maxYear };
    }

    // ── Time series ───────────────────────────────────────────────────────────
    if (timeBucket) {
      const dateField = field || "date";
      const { weeks, widx } = _buildWeekIndex(filtered, dateField);
      const byBucket = new Map();
      for (const row of filtered) {
        if (!row[dateField]) continue;
        const wi = widx.get(_weekStart(row[dateField]));
        if (wi !== undefined) byBucket.set(wi, (byBucket.get(wi) || 0) + 1);
      }
      if (!weeks.length)
        return { kind: "series", labels: [], values: [], granularity: "weekly", inWindowFlags: [] };

      const minIdx = 0;
      const maxIdx = weeks.length - 1;
      if (typeof InsightsChart !== "undefined") {
        return {
          kind: "series",
          ...InsightsChart.bucketByGranularity(weeks, byBucket, minIdx, maxIdx),
        };
      }
      return {
        kind: "series",
        labels: weeks,
        values: weeks.map((_, i) => byBucket.get(i) || 0),
        granularity: "weekly",
        inWindowFlags: weeks.map(() => true),
      };
    }

    // ── Grouped ───────────────────────────────────────────────────────────────
    if (groupBy) {
      const buckets = new Map();
      for (const row of filtered) {
        const key = row[groupBy] ?? "(none)";
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(row);
      }

      let groups = [...buckets.entries()].map(([key, gRows]) => {
        const value = _metric(metric, field, gRows);
        const count = gRows.length;
        const avg = field ? _metric("avg", field, gRows) : null;
        return { key, label: key, sub: "", value, count, avg };
      });

      groups.sort((a, b) => {
        const av = sort.by === "key" ? a.key : a.value;
        const bv = sort.by === "key" ? b.key : b.value;
        const cmp = typeof av === "number" ? av - bv : String(av).localeCompare(String(bv));
        return sort.dir === "asc" ? cmp : -cmp;
      });

      const total = filtered.length;

      // Zero-fill numeric buckets in ascending key order (e.g. rating distribution)
      if (fillSteps) {
        const { min: fsMin, max: fsMax, step: fsStep } = fillSteps;
        const byKey = new Map(groups.map((g) => [g.key, g]));
        const filled = [];
        for (let v = fsMin; v <= fsMax + fsStep * 0.001; v = Math.round((v + fsStep) * 100) / 100) {
          const k = Math.round(v * 100) / 100;
          filled.push(
            byKey.get(k) || { key: k, label: String(k), sub: "", value: 0, count: 0, avg: null },
          );
        }
        return { kind: "groups", groups: filled, total };
      }

      if (limit) groups = groups.slice(0, limit);

      return { kind: "groups", groups, total };
    }

    // ── Scalar ────────────────────────────────────────────────────────────────
    return { kind: "scalar", value: _metric(metric, field, filtered) };
  }

  return { aggregate };
})();
