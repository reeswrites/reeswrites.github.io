"use strict";

/**
 * Reusable calendar heatmap renderer.
 *
 * Lifted from beer.html's inline heatmap IIFE and generalised.
 * The `.heatmap-*` CSS lives in static/css/stats.css; page-specific
 * cell colours (e.g. beer's orange) are applied via a scoped inline
 * <style> on the page — this module only assigns `.heatmap-day--lN` classes.
 *
 * Usage:
 *
 *   InsightsHeatmap.init({
 *     container,        // CSS selector or DOM element for the heatmap grid
 *     navPrev,          // optional selector/element for the ‹ button
 *     navYear,          // optional selector/element for the year label
 *     navNext,          // optional selector/element for the › button
 *     items,            // { "YYYY-MM-DD": [row, …] }  (kind:"calendar" engine output)
 *     popoverContent,   // optional (dateStr, items) => HTML string
 *                       //   default: "N check-in(s)"
 *     countLevel,       // optional (n) => 0..4
 *                       //   default: 0→0, 1→1, 2→2, 3→3, ≥4→4
 *   });
 *
 * When navPrev/navYear/navNext are omitted the module builds its own
 * year-navigation bar inside the container element.
 */
const InsightsHeatmap = (() => {
  "use strict";

  const CELL_SIZE = 11;
  const CELL_GAP = 2;
  const CELL_STEP = CELL_SIZE + CELL_GAP;
  const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
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

  function _el(ref) {
    if (!ref) return null;
    return typeof ref === "string" ? document.querySelector(ref) : ref;
  }

  function _esc(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function _localDateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function _formatDate(dateStr) {
    const [y, m, d] = dateStr.split("-").map(Number);
    const months = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    return `${months[m - 1]} ${d}, ${y}`;
  }

  function _defaultCountLevel(n) {
    if (n === 0) return 0;
    if (n === 1) return 1;
    if (n === 2) return 2;
    if (n === 3) return 3;
    return 4;
  }

  function _defaultPopoverContent(dateStr, dayItems) {
    if (!dayItems.length) return `<span class="text-muted small">no items</span>`;
    return `<span class="small">${_esc(String(dayItems.length))} item${dayItems.length === 1 ? "" : "s"}</span>`;
  }

  function init({
    container,
    navPrev = null,
    navYear = null,
    navNext = null,
    items = {},
    popoverContent = _defaultPopoverContent,
    countLevel = _defaultCountLevel,
  } = {}) {
    const containerEl = _el(container);
    if (!containerEl) return;

    // ── Derive year bounds from items ─────────────────────────────────────────
    const allDates = Object.keys(items).sort();
    const minYear = allDates.length
      ? parseInt(allDates[0].slice(0, 4), 10)
      : new Date().getFullYear();
    const maxYear = allDates.length
      ? parseInt(allDates[allDates.length - 1].slice(0, 4), 10)
      : new Date().getFullYear();
    const curMaxYear = new Date().getFullYear();
    let currentYear = Math.max(minYear, Math.min(maxYear, curMaxYear));

    // ── Resolve or build nav elements ─────────────────────────────────────────
    let prevEl = _el(navPrev);
    let yearEl = _el(navYear);
    let nextEl = _el(navNext);
    let builtNav = null;

    if (!prevEl) {
      builtNav = document.createElement("div");
      builtNav.className = "heatmap-nav";

      prevEl = document.createElement("button");
      prevEl.type = "button";
      prevEl.className = "btn btn-sm btn-outline-secondary";
      prevEl.setAttribute("aria-label", "Previous year");
      prevEl.innerHTML = "&#8249;";

      yearEl = document.createElement("span");
      yearEl.className = "fw-semibold fs-6";

      nextEl = document.createElement("button");
      nextEl.type = "button";
      nextEl.className = "btn btn-sm btn-outline-secondary";
      nextEl.setAttribute("aria-label", "Next year");
      nextEl.innerHTML = "&#8250;";

      builtNav.append(prevEl, yearEl, nextEl);
      containerEl.appendChild(builtNav);
    }

    // ── Popover state ─────────────────────────────────────────────────────────
    let activePopover = null;
    let activeCell = null;
    let hideTimer = null;

    function scheduleHide() {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(hideActivePopover, 120);
    }
    function cancelScheduledHide() {
      clearTimeout(hideTimer);
      hideTimer = null;
    }

    function hideActivePopover() {
      cancelScheduledHide();
      if (activePopover) {
        try {
          activePopover.dispose();
        } catch {}
        activePopover = null;
        activeCell = null;
      }
    }

    function showPopover(cell) {
      if (activeCell === cell) return;
      cancelScheduledHide();
      hideActivePopover();

      const dateStr = cell.dataset.date;
      const dayItems = items[dateStr] || [];
      const content = popoverContent(dateStr, dayItems);

      activeCell = cell;
      activePopover = new bootstrap.Popover(cell, {
        html: true,
        sanitize: false,
        title: _formatDate(dateStr),
        content,
        trigger: "manual",
        container: "body",
        placement: "top",
      });
      activePopover.show();

      setTimeout(() => {
        const el = document.querySelector(".popover.show");
        if (el) {
          el.addEventListener("mouseenter", cancelScheduledHide);
          el.addEventListener("mouseleave", scheduleHide);
        }
      }, 0);
    }

    // Dismiss popover on outside click — bound once per init
    document.addEventListener("click", (e) => {
      if (!activePopover) return;
      const pop = document.querySelector(".popover.show");
      if (activeCell && activeCell.contains(e.target)) return;
      if (pop && pop.contains(e.target)) {
        if (e.target.closest("[data-modal-id]")) hideActivePopover();
        return;
      }
      hideActivePopover();
    });

    containerEl.addEventListener("mouseleave", scheduleHide);
    containerEl.addEventListener("mouseenter", cancelScheduledHide);

    // ── Year grid renderer ────────────────────────────────────────────────────

    // The grid mount is either the container itself (external-nav case) or a
    // sibling div below the built nav (built-nav case).
    let gridMount;
    if (builtNav) {
      gridMount = document.createElement("div");
      gridMount.className = "heatmap-wrapper";
      containerEl.appendChild(gridMount);
    } else {
      gridMount = containerEl;
    }

    function renderYear(year) {
      hideActivePopover();
      gridMount.innerHTML = "";

      const jan1 = new Date(year, 0, 1);
      const startDay = jan1.getDay();
      const daysInYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 366 : 365;
      const numWeeks = Math.ceil((daysInYear + startDay) / 7);

      const weeks = [];
      const monthFirstWk = {};
      for (let w = 0; w < numWeeks; w++) {
        const days = [];
        for (let d = 0; d < 7; d++) {
          const dayOfYear = w * 7 + d - startDay;
          if (dayOfYear < 0 || dayOfYear >= daysInYear) {
            days.push(null);
            continue;
          }
          const date = new Date(year, 0, dayOfYear + 1);
          const month = date.getMonth();
          if (!(month in monthFirstWk)) monthFirstWk[month] = w;
          days.push({ dateStr: _localDateStr(date) });
        }
        weeks.push(days);
      }

      // Month label row
      const monthRow = document.createElement("div");
      monthRow.className = "heatmap-month-labels";
      monthRow.style.width = `${numWeeks * CELL_STEP}px`;
      for (const [month, weekIdx] of Object.entries(monthFirstWk)) {
        const lbl = document.createElement("span");
        lbl.className = "heatmap-month-label";
        lbl.textContent = MONTH_NAMES[month];
        lbl.style.left = `${weekIdx * CELL_STEP}px`;
        monthRow.appendChild(lbl);
      }

      // Body: weekday labels + week columns
      const body = document.createElement("div");
      body.className = "heatmap-body";

      const wdCol = document.createElement("div");
      wdCol.className = "heatmap-weekday-labels";
      for (let d = 0; d < 7; d++) {
        const span = document.createElement("span");
        span.className = "heatmap-weekday-label";
        span.textContent = d === 1 || d === 3 || d === 5 ? WEEKDAY_LABELS[d] : "";
        wdCol.appendChild(span);
      }
      body.appendChild(wdCol);

      const weeksDiv = document.createElement("div");
      weeksDiv.className = "heatmap-weeks";
      for (const days of weeks) {
        const weekCol = document.createElement("div");
        weekCol.className = "heatmap-week";
        for (const day of days) {
          const cell = document.createElement("div");
          cell.className = "heatmap-day";
          if (!day) {
            cell.classList.add("heatmap-day--pad");
          } else {
            const n = (items[day.dateStr] || []).length;
            cell.classList.add(`heatmap-day--l${countLevel(n)}`);
            cell.dataset.date = day.dateStr;
            cell.dataset.count = n;
            cell.addEventListener("mouseenter", () => showPopover(cell));
            cell.addEventListener("mouseleave", scheduleHide);
          }
          weekCol.appendChild(cell);
        }
        weeksDiv.appendChild(weekCol);
      }
      body.appendChild(weeksDiv);

      // Legend
      const legend = document.createElement("div");
      legend.className = "heatmap-legend";
      legend.innerHTML = `<span>Less</span>
        <div class="heatmap-legend-cell heatmap-day--l0"></div>
        <div class="heatmap-legend-cell heatmap-day--l1"></div>
        <div class="heatmap-legend-cell heatmap-day--l2"></div>
        <div class="heatmap-legend-cell heatmap-day--l3"></div>
        <div class="heatmap-legend-cell heatmap-day--l4"></div>
        <span>More</span>`;

      gridMount.append(monthRow, body, legend);
    }

    // ── Nav update ────────────────────────────────────────────────────────────

    function updateNav() {
      if (yearEl) yearEl.textContent = currentYear;
      if (prevEl) prevEl.disabled = currentYear <= minYear;
      if (nextEl) nextEl.disabled = currentYear >= Math.max(maxYear, curMaxYear);
    }

    prevEl?.addEventListener("click", () => {
      if (currentYear > minYear) {
        currentYear--;
        renderYear(currentYear);
        updateNav();
      }
    });
    nextEl?.addEventListener("click", () => {
      const cap = Math.max(maxYear, curMaxYear);
      if (currentYear < cap) {
        currentYear++;
        renderYear(currentYear);
        updateNav();
      }
    });

    // ── Initial render ────────────────────────────────────────────────────────
    renderYear(currentYear);
    updateNav();
  }

  return { init };
})();
