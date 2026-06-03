"use strict";

/**
 * Reusable roughViz chart helpers for data-page insights dashboards.
 * Requires rough-viz@2.0.5 to be loaded before calling these.
 *
 * Exposes a global `InsightsChart` object:
 *
 *   InsightsChart.barChart("#my-chart", { labels, values, color, inWindowFlags })
 *
 *   const { labels, values, granularity, inWindowFlags } =
 *     InsightsChart.bucketByGranularity(weeks, byBucket, 0, 51);
 */
const InsightsChart = (() => {
  "use strict";

  const MONTH_NAMES = [
    "Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec",
  ];

  /**
   * Render a roughViz bar chart with standard site styling.
   *
   * @param {string} selector  CSS selector for the container (e.g. "#my-chart")
   * @param {{ labels: string[], values: number[], color: string, inWindowFlags?: boolean[] }} opts
   */
  function barChart(selector, { labels, values, color, inWindowFlags } = {}) {
    if (typeof roughViz === "undefined") return;
    const container = document.querySelector(selector);
    if (!container) return;
    container.innerHTML = "";

    new roughViz.Bar({
      element: selector,
      data: { labels, values },
      width: container.offsetWidth,
      color,
      fillStyle: "hachure",
      roughness: 2,
      strokeWidth: 1,
      interactive: true,
      margin: { top: 10, left: 60, right: 20, bottom: 60 },
    });

    // Locale-format tooltip values.
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

    // Post-process: gray out non-window bars (roughViz doesn't support per-bar colors).
    if (inWindowFlags) {
      const elemId = selector.startsWith("#") ? selector.slice(1) : null;
      if (elemId) {
        const barGroups = [...container.querySelectorAll("g")].filter(
          (g) => g.getAttribute("class") === elemId,
        );
        barGroups.forEach((group, i) => {
          if (inWindowFlags[i]) return;
          group.querySelectorAll("path[style]").forEach((p) => {
            p.setAttribute(
              "style",
              p.getAttribute("style").replace(/stroke:[^;]+/, "stroke: #ced4da"),
            );
          });
        });
      }
    }
  }

  /**
   * Compute chart labels + values from a per-week bucket map with auto granularity.
   *
   * Granularity rules:
   *   ≤ 13 weeks in window  → weekly  ("Jan 6", "Jan 13", …)
   *   ≤ 24 distinct months  → monthly ("Jan", "Feb '24", …)
   *   else                  → yearly  ("2023", "2024", …)
   *
   * @param {string[]} weeks             Full sorted array of week-start strings (YYYY-MM-DD).
   * @param {Map<number,number>} byBucket weekIdx → count (window-filtered).
   * @param {number} minIdx              Inclusive window start index.
   * @param {number} maxIdx              Inclusive window end index.
   * @param {Map<number,number>} [allByBucket]
   *   Optional: full-dataset bucket map for the yearly view — shows all years with
   *   window years highlighted in full colour and others greyed.  Omit to show
   *   only the years present in the current window.
   * @returns {{ labels: string[], values: number[], granularity: string, inWindowFlags: boolean[] }}
   */
  function bucketByGranularity(weeks, byBucket, minIdx, maxIdx, allByBucket) {
    const windowWeeks    = weeks.slice(minIdx, maxIdx + 1);
    const windowYears    = [...new Set(windowWeeks.map((w) => w.slice(0, 4)))];
    const weekCount      = windowWeeks.length;
    const distinctMonths = [...new Set(windowWeeks.map((w) => w.slice(0, 7)))].sort();

    let labels, values, inWindowFlags, granularity;

    if (weekCount <= 13) {
      // ── Weekly ─────────────────────────────────────────────────────────────
      granularity   = "weekly";
      labels        = windowWeeks.map((w) => {
        const d = new Date(w + "T12:00:00");
        return `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
      });
      values        = windowWeeks.map((_, i) => byBucket.get(minIdx + i) ?? 0);
      inWindowFlags = windowWeeks.map(() => true);

    } else if (distinctMonths.length <= 24) {
      // ── Monthly ────────────────────────────────────────────────────────────
      granularity = "monthly";
      const monthTotals = {};
      for (const [bi, count] of byBucket) {
        const month = weeks[bi].slice(0, 7);
        monthTotals[month] = (monthTotals[month] || 0) + count;
      }
      const monthKeys = Object.keys(monthTotals).sort();
      const multiYear = new Set(monthKeys.map((m) => m.slice(0, 4))).size > 1;
      labels        = monthKeys.map((m) => {
        const name = MONTH_NAMES[parseInt(m.slice(5), 10) - 1];
        return multiYear ? `${name} '${m.slice(2, 4)}` : name;
      });
      values        = monthKeys.map((m) => monthTotals[m]);
      inWindowFlags = monthKeys.map(() => true);

    } else {
      // ── Yearly ─────────────────────────────────────────────────────────────
      granularity = "yearly";
      const sourceBuckets = allByBucket ?? byBucket;
      const yearTotals    = {};
      for (const [bi, count] of sourceBuckets) {
        const year = weeks[bi].slice(0, 4);
        yearTotals[year] = (yearTotals[year] || 0) + count;
      }
      const years     = Object.keys(yearTotals).sort();
      const winYears  = new Set(windowYears);
      labels        = years;
      values        = years.map((y) => yearTotals[y]);
      inWindowFlags = years.map((y) => winYears.has(y));
    }

    return { labels, values, granularity, inWindowFlags };
  }

  return { barChart, bucketByGranularity };
})();
