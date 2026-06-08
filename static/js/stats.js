"use strict";

/**
 * Stats page — heatmap + insight charts.
 *
 * Expects the following globals (injected via Liquid in stats.html):
 *   window.STATS_POSTS    — array of { title, url, type, date, tags }
 *   window.STATS_SECTIONS — object mapping label → count for the site-sections chart
 */
(function () {
  // ── Constants ──────────────────────────────────────────────────────────────
  const CELL_SIZE = 11;
  const CELL_GAP = 2;
  const CELL_STEP = CELL_SIZE + CELL_GAP; // 13 px per column/row
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
  const SITE_GREEN = "#467536";

  // ── Data setup ─────────────────────────────────────────────────────────────
  const posts = window.STATS_POSTS || [];

  /** Group posts by calendar date (YYYY-MM-DD) → [{title, url}, …] */
  function groupByDate(posts) {
    const out = {};
    for (const p of posts) {
      if (!out[p.date]) out[p.date] = [];
      out[p.date].push({ title: p.title, url: p.url });
    }
    return out;
  }

  const byDate = groupByDate(posts);
  const allDates = Object.keys(byDate).sort();
  const minYear = allDates.length
    ? parseInt(allDates[0].slice(0, 4), 10)
    : new Date().getFullYear();
  const maxYear = new Date().getFullYear();
  let currentYear = maxYear;

  // ── Popover state ──────────────────────────────────────────────────────────
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
      } catch (_) {}
      activePopover = null;
      activeCell = null;
    }
  }

  /**
   * Show a Bootstrap popover on `cell` listing the posts published on that day.
   * Disposes any previously-open popover first.
   */
  function showPopover(cell) {
    if (activeCell === cell) return;
    cancelScheduledHide();
    hideActivePopover();

    const posts = byDate[cell.dataset.date] || [];
    const dateLabel = formatDateDisplay(cell.dataset.date);
    const content = posts.length
      ? `<ul class="heatmap-post-list list-unstyled mb-0">${posts.map((p) => `<li><a href="${escHtml(p.url)}" class="text-decoration-none">${escHtml(p.title)}</a></li>`).join("")}</ul>`
      : `<span class="text-muted small">nothing published</span>`;

    activeCell = cell;
    activePopover = new bootstrap.Popover(cell, {
      html: true,
      title: dateLabel,
      content,
      trigger: "manual",
      container: "body",
      placement: "top",
    });
    activePopover.show();

    // After Bootstrap inserts the popover into the DOM, wire hover so moving
    // the cursor into the popover cancels the pending hide.
    setTimeout(() => {
      const popoverEl = document.querySelector(".popover.show");
      if (popoverEl) {
        popoverEl.addEventListener("mouseenter", cancelScheduledHide);
        popoverEl.addEventListener("mouseleave", scheduleHide);
      }
    }, 0);
  }

  /** Close the active popover when clicking outside it and its trigger cell. */
  document.addEventListener("click", function (e) {
    if (!activePopover) return;
    const popoverEl = document.querySelector(".popover.show");
    if (activeCell && activeCell.contains(e.target)) return;
    if (popoverEl && popoverEl.contains(e.target)) return;
    hideActivePopover();
  });

  // ── Heatmap rendering ──────────────────────────────────────────────────────

  /**
   * Render the contribution heatmap for `year` into #stats-heatmap.
   * Columns = ISO weeks (Sun–Sat), rows = day of week.
   */
  function renderYear(year) {
    hideActivePopover();

    const container = document.getElementById("stats-heatmap");
    if (!container) return;
    container.innerHTML = "";

    // Jan 1 of this year and how many days it has
    const jan1 = new Date(year, 0, 1);
    const startDay = jan1.getDay(); // 0=Sun … 6=Sat
    const daysInYear = isLeapYear(year) ? 366 : 365;
    const numWeeks = Math.ceil((daysInYear + startDay) / 7);

    // ── Build per-week, per-day metadata ──────────────────────────────────
    const weeks = [];
    const monthFirstWeek = {}; // month (0-11) → first week column it appears in

    for (let w = 0; w < numWeeks; w++) {
      const days = [];
      for (let d = 0; d < 7; d++) {
        const dayOfYear = w * 7 + d - startDay;
        if (dayOfYear < 0 || dayOfYear >= daysInYear) {
          days.push(null); // padding
          continue;
        }
        const date = new Date(year, 0, dayOfYear + 1);
        const month = date.getMonth();
        if (!(month in monthFirstWeek)) monthFirstWeek[month] = w;
        days.push({
          dateStr: localDateStr(date),
          dayOfWeek: d,
          month,
        });
      }
      weeks.push(days);
    }

    // ── Month-label row ───────────────────────────────────────────────────
    const monthRow = document.createElement("div");
    monthRow.className = "heatmap-month-labels";
    monthRow.style.width = `${numWeeks * CELL_STEP}px`;

    for (const [month, weekIdx] of Object.entries(monthFirstWeek)) {
      const lbl = document.createElement("span");
      lbl.className = "heatmap-month-label";
      lbl.textContent = MONTH_NAMES[month];
      lbl.style.left = `${weekIdx * CELL_STEP}px`;
      monthRow.appendChild(lbl);
    }

    // ── Body: weekday labels + week columns ───────────────────────────────
    const body = document.createElement("div");
    body.className = "heatmap-body";

    // Weekday label column (show Mon, Wed, Fri like GitHub)
    const wdCol = document.createElement("div");
    wdCol.className = "heatmap-weekday-labels";
    for (let d = 0; d < 7; d++) {
      const span = document.createElement("span");
      span.className = "heatmap-weekday-label";
      span.textContent = d === 1 || d === 3 || d === 5 ? WEEKDAY_LABELS[d] : "";
      wdCol.appendChild(span);
    }
    body.appendChild(wdCol);

    // Week columns
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
          const count = (byDate[day.dateStr] || []).length;
          cell.classList.add(`heatmap-day--l${postCountLevel(count)}`);
          cell.dataset.date = day.dateStr;
          cell.dataset.count = count;
          cell.addEventListener("mouseenter", () => showPopover(cell));
        }
        weekCol.appendChild(cell);
      }
      weeksDiv.appendChild(weekCol);
    }
    body.appendChild(weeksDiv);

    // ── Legend ────────────────────────────────────────────────────────────
    const legend = document.createElement("div");
    legend.className = "heatmap-legend";
    legend.innerHTML = `
      <span>Less</span>
      <div class="heatmap-legend-cell heatmap-day--l0"></div>
      <div class="heatmap-legend-cell heatmap-day--l1"></div>
      <div class="heatmap-legend-cell heatmap-day--l2"></div>
      <div class="heatmap-legend-cell heatmap-day--l3"></div>
      <div class="heatmap-legend-cell heatmap-day--l4"></div>
      <span>More</span>`;

    // Assemble
    container.appendChild(monthRow);
    container.appendChild(body);
    container.appendChild(legend);
  }

  /** Map a post count to a color level 0-4. */
  function postCountLevel(count) {
    if (count === 0) return 0;
    if (count === 1) return 1;
    if (count === 2) return 2;
    if (count === 3) return 3;
    return 4;
  }

  // ── Year navigation ────────────────────────────────────────────────────────

  function updateNav() {
    const yearLabel = document.getElementById("heatmap-year");
    const prevBtn = document.getElementById("heatmap-prev");
    const nextBtn = document.getElementById("heatmap-next");
    if (yearLabel) yearLabel.textContent = currentYear;
    if (prevBtn) prevBtn.disabled = currentYear <= minYear;
    if (nextBtn) nextBtn.disabled = currentYear >= maxYear;
  }

  const prevBtn = document.getElementById("heatmap-prev");
  const nextBtn = document.getElementById("heatmap-next");

  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      if (currentYear > minYear) {
        currentYear--;
        renderYear(currentYear);
        updateNav();
      }
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      if (currentYear < maxYear) {
        currentYear++;
        renderYear(currentYear);
        updateNav();
      }
    });
  }

  // ── Charts ────────────────────────────────────────────────────────────────

  function renderCharts() {
    if (typeof InsightsChart === "undefined") return;

    // Posts by type
    const typeCounts = {};
    for (const p of posts) {
      typeCounts[p.type] = (typeCounts[p.type] || 0) + 1;
    }
    const sortedTypes = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);
    InsightsChart.barChart("#chart-by-type", {
      labels: sortedTypes.map(([t]) => t.charAt(0).toUpperCase() + t.slice(1)),
      values: sortedTypes.map(([, c]) => c),
      color: SITE_GREEN,
    });

    // Posts by year
    const yearCounts = {};
    for (const p of posts) {
      const yr = p.date.slice(0, 4);
      yearCounts[yr] = (yearCounts[yr] || 0) + 1;
    }
    const years = Object.keys(yearCounts).sort();
    InsightsChart.barChart("#chart-by-year", {
      labels: years,
      values: years.map((y) => yearCounts[y]),
      color: SITE_GREEN,
    });
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  function isLeapYear(y) {
    return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  }

  /** Build a YYYY-MM-DD string from a Date in *local* time (avoids UTC shift). */
  function localDateStr(d) {
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const dy = String(d.getDate()).padStart(2, "0");
    return `${y}-${mo}-${dy}`;
  }

  /** "2024-03-15" → "March 15, 2024" */
  function formatDateDisplay(dateStr) {
    const [y, m, d] = dateStr.split("-").map(Number);
    const fullMonths = [
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
    return `${fullMonths[m - 1]} ${d}, ${y}`;
  }

  /** Minimal HTML-escape for injected strings. */
  function escHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  renderYear(currentYear);
  updateNav();
  renderCharts();

  // Dismiss the popover when the cursor leaves the heatmap (unless it moves
  // into the popover itself — handled by the popover's own mouseenter above).
  const heatmapContainer = document.getElementById("stats-heatmap");
  if (heatmapContainer) {
    heatmapContainer.addEventListener("mouseleave", scheduleHide);
    heatmapContainer.addEventListener("mouseenter", cancelScheduledHide);
  }

  // ── Shared pagination helper ───────────────────────────────────────────────

  const PER_PAGE = 10;

  function buildPagination(current, total) {
    if (total <= 1) return "";

    // Always render exactly 7 fixed page slots so the component never changes width.
    let slots;
    if (total <= 7) {
      slots = Array.from({ length: total }, (_, i) => i + 1);
    } else if (current <= 4) {
      slots = [1, 2, 3, 4, 5, "…", total];
    } else if (current >= total - 3) {
      slots = [1, "…", total - 4, total - 3, total - 2, total - 1, total];
    } else {
      slots = [1, "…", current - 1, current, current + 1, "…", total];
    }

    const prevItem = `<li class="page-item ${current === 1 ? "disabled" : ""}">
      <button class="page-link" data-page="${current - 1}">&#8249;</button></li>`;
    const nextItem = `<li class="page-item ${current === total ? "disabled" : ""}">
      <button class="page-link" data-page="${current + 1}">&#8250;</button></li>`;

    const pageItems = slots
      .map((p) =>
        p === "…"
          ? `<li class="page-item disabled"><span class="page-link">&hellip;</span></li>`
          : `<li class="page-item ${p === current ? "active" : ""}">
            <button class="page-link" data-page="${p}">${p}</button></li>`,
      )
      .join("");

    return `<nav><ul class="pagination pagination-sm mb-0 mt-2">${prevItem}${pageItems}${nextItem}</ul></nav>`;
  }

  function attachPagination(container, onChange) {
    container.querySelectorAll(".page-link[data-page]").forEach((btn) => {
      btn.addEventListener("click", () => onChange(parseInt(btn.dataset.page, 10)));
    });
  }

  // ── Word-count leaderboard ─────────────────────────────────────────────────

  // Stable rank = position in default sort (words desc)
  const postRankMap = new Map(
    [...posts].sort((a, b) => b.words - a.words).map((p, i) => [p.url, i + 1]),
  );

  let leaderboardAsc = false;
  let leaderboardPage = 1;

  // Build the word-count table skeleton once; subsequent renders only swap tbody + pagination.
  const lbContainer = document.getElementById("post-leaderboard");
  if (lbContainer) {
    lbContainer.innerHTML = `
      <table class="table table-sm table-hover mb-0">
        <thead class="table-light">
          <tr>
            <th>#</th>
            <th>Post</th>
            <th id="lb-sort-words" class="text-end" style="cursor:pointer;user-select:none;white-space:nowrap;"></th>
          </tr>
        </thead>
        <tbody id="lb-tbody"></tbody>
      </table>
      <div id="lb-pagination"></div>`;

    document.getElementById("lb-sort-words").addEventListener("click", () => {
      leaderboardAsc = !leaderboardAsc;
      leaderboardPage = 1;
      renderLeaderboard();
    });
  }

  function renderLeaderboard() {
    const tbody = document.getElementById("lb-tbody");
    const paginationEl = document.getElementById("lb-pagination");
    const sortHeader = document.getElementById("lb-sort-words");
    if (!tbody) return;

    const sorted = [...posts].sort((a, b) =>
      leaderboardAsc ? a.words - b.words : b.words - a.words,
    );
    const total = Math.ceil(sorted.length / PER_PAGE);
    leaderboardPage = Math.min(leaderboardPage, total);

    const slice = sorted.slice((leaderboardPage - 1) * PER_PAGE, leaderboardPage * PER_PAGE);

    if (sortHeader) sortHeader.textContent = `Words ${leaderboardAsc ? "↑" : "↓"}`;

    const padRows = Array(PER_PAGE - slice.length)
      .fill("<tr><td>&nbsp;</td><td></td><td></td></tr>")
      .join("");
    tbody.innerHTML =
      slice
        .map(
          (p) => `
      <tr>
        <td class="text-muted pe-2">${postRankMap.get(p.url)}</td>
        <td><span class="lb-title-wrap"><span class="badge bg-secondary lb-type-badge">${escHtml(p.type || "post")}</span><a href="${escHtml(p.url)}" class="text-decoration-none lb-title-link">${escHtml(p.title)}</a></span></td>
        <td class="text-end text-muted">${p.words.toLocaleString()}</td>
      </tr>`,
        )
        .join("") + padRows;

    if (paginationEl) {
      paginationEl.innerHTML = buildPagination(leaderboardPage, total);
      attachPagination(paginationEl, (page) => {
        leaderboardPage = page;
        renderLeaderboard();
      });
    }
  }

  renderLeaderboard();

  // ── Tag leaderboard ────────────────────────────────────────────────────────

  const tagCounts = {};
  for (const p of posts) {
    for (const tag of p.tags || []) {
      if (/^\d{4}$/.test(tag)) continue;
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    }
  }

  // Stable rank = position in default sort (count desc)
  const tagRankMap = new Map(
    Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([tag], i) => [tag, i + 1]),
  );

  let tagSortCol = "count";
  let tagSortAsc = false;
  let tagsPage = 1;

  // Build the tag table skeleton once.
  const tagContainer = document.getElementById("tag-leaderboard");
  if (tagContainer) {
    tagContainer.innerHTML = `
      <table class="table table-sm table-hover mb-0">
        <thead class="table-light">
          <tr>
            <th>#</th>
            <th id="tag-sort-name" style="cursor:pointer;user-select:none;white-space:nowrap;"></th>
            <th id="tag-sort-count" class="text-end" style="cursor:pointer;user-select:none;white-space:nowrap;"></th>
          </tr>
        </thead>
        <tbody id="tag-tbody"></tbody>
      </table>
      <div id="tag-pagination"></div>`;

    document.getElementById("tag-sort-name").addEventListener("click", () => {
      tagSortCol === "name"
        ? (tagSortAsc = !tagSortAsc)
        : ((tagSortCol = "name"), (tagSortAsc = true));
      tagsPage = 1;
      renderTagLeaderboard();
    });
    document.getElementById("tag-sort-count").addEventListener("click", () => {
      tagSortCol === "count"
        ? (tagSortAsc = !tagSortAsc)
        : ((tagSortCol = "count"), (tagSortAsc = false));
      tagsPage = 1;
      renderTagLeaderboard();
    });
  }

  function sortedTagEntries() {
    return Object.entries(tagCounts).sort((a, b) =>
      tagSortCol === "name"
        ? tagSortAsc
          ? a[0].localeCompare(b[0])
          : b[0].localeCompare(a[0])
        : tagSortAsc
          ? a[1] - b[1]
          : b[1] - a[1],
    );
  }

  function renderTagLeaderboard() {
    const tbody = document.getElementById("tag-tbody");
    const paginationEl = document.getElementById("tag-pagination");
    const nameHeader = document.getElementById("tag-sort-name");
    const countHeader = document.getElementById("tag-sort-count");
    if (!tbody) return;

    const sorted = sortedTagEntries();
    const total = Math.ceil(sorted.length / PER_PAGE);
    tagsPage = Math.min(tagsPage, total);

    const slice = sorted.slice((tagsPage - 1) * PER_PAGE, tagsPage * PER_PAGE);

    if (nameHeader)
      nameHeader.innerHTML = `Tag${tagSortCol === "name" ? ` ${tagSortAsc ? "↑" : "↓"}` : ""}`;
    if (countHeader)
      countHeader.innerHTML = `Posts${tagSortCol === "count" ? ` ${tagSortAsc ? "↑" : "↓"}` : ""}`;

    const tagPadRows = Array(PER_PAGE - slice.length)
      .fill("<tr><td>&nbsp;</td><td></td><td></td></tr>")
      .join("");
    tbody.innerHTML =
      slice
        .map(
          ([tag, count]) => `
      <tr>
        <td class="text-muted pe-2">${tagRankMap.get(tag)}</td>
        <td>${escHtml(tag)}</td>
        <td class="text-end text-muted">${count}</td>
      </tr>`,
        )
        .join("") + tagPadRows;

    if (paginationEl) {
      paginationEl.innerHTML = buildPagination(tagsPage, total);
      attachPagination(paginationEl, (page) => {
        tagsPage = page;
        renderTagLeaderboard();
      });
    }
  }

  renderTagLeaderboard();
})();
