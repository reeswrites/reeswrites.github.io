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

  function _fmtChart(container) {
    // Allow rotated x-axis labels to extend past the SVG boundary without clipping.
    const svg = container.querySelector("svg");
    if (svg) svg.style.overflow = "visible";

    // Tooltip: locale-format the attrY value roughViz reads on hover.
    container.querySelectorAll("g[attrY]").forEach((el) => {
      const raw = el.getAttribute("attrY");
      const num = parseFloat(raw);
      if (!isNaN(num) && String(num) === raw) el.setAttribute("attrY", num.toLocaleString());
    });
    // Y-axis tick labels: plain integers without a transform (X-axis labels have
    // rotate(-45) transform, so :not([transform]) skips them safely).
    const yTicks = [...container.querySelectorAll("svg text:not([transform])")].filter((el) =>
      /^\d+$/.test(el.textContent.trim()),
    );
    yTicks.forEach((el) => {
      const formatted = parseInt(el.textContent.trim(), 10).toLocaleString();
      if (formatted !== el.textContent.trim()) el.textContent = formatted;
    });
    // Keep at most 5 visible tick labels; always show first (0) and last.
    if (yTicks.length > 5) {
      const step = Math.ceil(yTicks.length / 4);
      yTicks.forEach((el, i) => {
        const keep = i === 0 || i === yTicks.length - 1 || i % step === 0;
        el.style.visibility = keep ? "" : "hidden";
      });
    }
  }

  /**
   * Render a roughViz bar chart with standard site styling.
   *
   * @param {string} selector  CSS selector for the container (e.g. "#my-chart")
   * @param {{ labels: string[], values: number[], color: string, inWindowFlags?: boolean[] }} opts
   */
  /**
   * Resolve a color string: if it starts with "--" it is treated as a CSS
   * custom-property name and resolved via getComputedStyle. Falls back to
   * Bootstrap blue if the property is empty or the string is falsy.
   */
  function resolveColor(color) {
    if (!color) return "#0d6efd";
    if (color.startsWith("--")) {
      const resolved = getComputedStyle(document.documentElement)
        .getPropertyValue(color)
        .trim();
      return resolved || "#0d6efd";
    }
    return color;
  }

  function barChart(selector, { labels, values, color, inWindowFlags } = {}) {
    if (typeof roughViz === "undefined") return;
    const container = document.querySelector(selector);
    if (!container) return;
    container.innerHTML = "";

    const resolvedColor = resolveColor(color);
    new roughViz.Bar({
      element: selector,
      data: { labels, values },
      width: container.offsetWidth,
      color: resolvedColor,
      fillStyle: "hachure",
      roughness: 2,
      strokeWidth: 1,
      interactive: true,
      margin: {
        top: 10,
        left: Math.max(60, Math.max(...values).toLocaleString().length * 8 + 20),
        right: 20,
        bottom: 60,
      },
    });

    // Re-format axis + tooltip values after every roughViz re-render (roughViz
    // re-draws on window.resize, which data.html dispatches on tab clicks).
    // Remove any previous listener so we don't stack them across re-renders.
    if (container._fmtListener) window.removeEventListener("resize", container._fmtListener);
    container._fmtListener = () => _fmtChart(container);
    window.addEventListener("resize", container._fmtListener);
    _fmtChart(container);

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

    const elemId = selector.startsWith("#") ? selector.slice(1) : null;
    if (elemId) {
      const barGroups = [...container.querySelectorAll("g")].filter(
        (g) => g.getAttribute("class") === elemId,
      );

      // Post-process: gray out non-window bars (roughViz doesn't support per-bar colors).
      if (inWindowFlags) {
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

      // Stagger bars in once, only when the chart scrolls into view. Skip on
      // resize re-draws (container._animated already set) and for users who
      // prefer reduced motion.
      if (!container._animated && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        container._animated = true;
        const perBar = Math.min(70, 500 / barGroups.length);
        barGroups.forEach((g) => { g.style.opacity = "0"; });
        const observer = new IntersectionObserver((entries, obs) => {
          if (!entries[0].isIntersecting) return;
          obs.disconnect();
          barGroups.forEach((group, i) => {
            group.style.transition = "opacity 0.25s ease";
            setTimeout(() => { group.style.opacity = "1"; }, i * perBar);
          });
        }, { threshold: 0.5 });
        observer.observe(container);
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
  function bucketByGranularity(weeks, byBucket, minIdx, maxIdx, allByBucket, excludeYears = []) {
    const windowWeeks = weeks.slice(minIdx, maxIdx + 1);
    const windowYears = [...new Set(windowWeeks.map((w) => w.slice(0, 4)))];
    const weekCount = windowWeeks.length;
    const distinctMonths = [...new Set(windowWeeks.map((w) => w.slice(0, 7)))].sort();

    let labels, values, inWindowFlags, granularity;

    if (weekCount <= 13) {
      // ── Weekly ─────────────────────────────────────────────────────────────
      granularity = "weekly";
      labels = windowWeeks.map((w) => {
        const d = new Date(w + "T12:00:00");
        return `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
      });
      values = windowWeeks.map((_, i) => byBucket.get(minIdx + i) ?? 0);
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
      labels = monthKeys.map((m) => {
        const name = MONTH_NAMES[parseInt(m.slice(5), 10) - 1];
        return multiYear ? `${name} '${m.slice(2, 4)}` : name;
      });
      values = monthKeys.map((m) => monthTotals[m]);
      inWindowFlags = monthKeys.map(() => true);
    } else {
      // ── Yearly ─────────────────────────────────────────────────────────────
      granularity = "yearly";
      const sourceBuckets = allByBucket ?? byBucket;
      const yearTotals = {};
      for (const [bi, count] of sourceBuckets) {
        const year = weeks[bi].slice(0, 4);
        yearTotals[year] = (yearTotals[year] || 0) + count;
      }
      const excluded = new Set(excludeYears.map(String));
      const years = Object.keys(yearTotals)
        .filter((y) => !excluded.has(y))
        .sort();
      const winYears = new Set(windowYears);
      labels = years;
      values = years.map((y) => yearTotals[y]);
      inWindowFlags = years.map((y) => winYears.has(y));
    }

    return { labels, values, granularity, inWindowFlags };
  }

  /**
   * Render a roughViz donut chart with standard site styling.
   *
   * @param {string} selector  CSS selector for the container (e.g. "#my-chart")
   * @param {{ labels: string[], values: number[], color?: string }} opts
   */
  function donutChart(selector, { labels, values } = {}) {
    if (typeof roughViz === "undefined" || typeof roughViz.Donut === "undefined") return;
    const container = document.querySelector(selector);
    if (!container) return;
    container.innerHTML = "";

    const width = container.offsetWidth || 300;
    const height = Math.max(250, container.offsetHeight || 300);

    new roughViz.Donut({
      element: selector,
      data: { labels, values },
      width,
      height,
      roughness: 2,
      strokeWidth: 1,
      interactive: true,
      margin: { top: 10, left: 0, right: 0, bottom: 10 },
    });

    if (container._donutFmtListener)
      window.removeEventListener("resize", container._donutFmtListener);
    container._donutFmtListener = () => _fmtChart(container);
    window.addEventListener("resize", container._donutFmtListener);
    _fmtChart(container);
  }

  return { barChart, donutChart, bucketByGranularity, resolveColor };
})();
