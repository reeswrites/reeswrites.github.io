"use strict";

/**
 * Generic filter bar for DataTable pages.
 *
 * Auto-inits from #data-filter-bar if present. Reads data-* config attributes:
 *   data-stars="true"              — minimum-star threshold filter
 *   data-genres="true"             — genre multiselect+search filter
 *   data-genre-label="Genre"       — button label (default "Genre")
 *   data-type="true"               — type multiselect+search filter
 *   data-type-label="Type"         — button label (default "Type")
 *   data-mechanism="true"          — mechanism multiselect+search filter
 *   data-mechanism-label="…"       — button label (default "Mechanism")
 *   data-notes="true"              — note-ingredient text search (fragrance)
 *   data-length="true"             — short/feature length filter (movies)
 *
 * Rows must carry data attributes:
 *   data-rating="4.5"              — numeric rating (stars pages)
 *   data-genre="comedy|drama"      — pipe-separated lowercase genres (multi per row)
 *   data-type="eau de parfum"      — lowercase type string (single value)
 *   data-mechanism="set collection|dice rolling" — pipe-separated lowercase mechanisms (multi per row)
 *   data-notes="lavender rose"     — space-separated note ingredients (lowercase)
 *   data-runtime="95"              — integer minutes (length pages)
 *
 * Filtering is OR within a facet, AND across facets.
 * URL state via DataUrlState: ?rmin=3&rmax=5&genre=comedy,thriller&type=card etc.
 * Multiple selections for a facet are comma-joined in the URL param.
 */
const DataFilters = (() => {
  "use strict";

  const _initParams = new URLSearchParams(window.location.search);
  let _minRating = parseFloat(_initParams.get("rmin") || "0");
  let _maxRating = parseFloat(_initParams.get("rmax") || "5");
  let _noteQuery = "";
  let _lengthFilter = "";
  let _cfg = {};

  // Facet descriptors: attr = tr.dataset key, param = URL param, pipe = split on "|"
  const FACETS = {
    genre: { attr: "genre", param: "genre", pipe: true },
    type: { attr: "type", param: "type", pipe: false },
    mechanism: { attr: "mechanism", param: "mechanism", pipe: true },
  };
  // Per-facet selected value Sets
  const _selected = { genre: new Set(), type: new Set(), mechanism: new Set() };
  // Button labels read from data-*-label attributes (set during _setupFacet)
  const _labels = {};

  // ── DataTables custom search (global, scoped to #myTable) ────────────────

  if (typeof DataTable !== "undefined") {
    DataTable.ext.search.push(function (settings, _data, _idx) {
      if (settings.nTable.id !== "myTable") return true;

      // DataTables passes row data as the 2nd/3rd args; access the TR node via aoData.
      const tr = settings.aoData[_idx]?.nTr;
      if (!tr) return true;

      if (_cfg.stars && (_minRating > 0 || _maxRating < 5)) {
        const r = parseFloat(tr.dataset.rating || "0");
        if (r < _minRating || r > _maxRating) return false;
      }

      // Facet filters: OR within a facet, AND across enabled facets
      for (const [key, facet] of Object.entries(FACETS)) {
        if (!_cfg[key] || _selected[key].size === 0) continue;
        const raw = tr.dataset[facet.attr] || "";
        const vals = facet.pipe ? raw.split("|").filter(Boolean) : raw ? [raw] : [];
        if (!vals.some((v) => _selected[key].has(v))) return false;
      }

      if (_cfg.notes && _noteQuery) {
        if (!(tr.dataset.notes || "").includes(_noteQuery)) return false;
      }
      if (_cfg.length && _lengthFilter) {
        const runtime = parseInt(tr.dataset.runtime || "0", 10);
        if (_lengthFilter === "short" && !(runtime > 0 && runtime <= 40)) return false;
        if (_lengthFilter === "feature" && runtime > 0 && runtime <= 40) return false;
      }
      return true;
    });
  }

  // ── DataTable redraw ──────────────────────────────────────────────────────

  function _redraw() {
    const el = document.getElementById("myTable");
    if (el && typeof DataTable !== "undefined" && DataTable.isDataTable(el)) {
      new DataTable(el).draw();
    }
  }

  // ── Reset button ──────────────────────────────────────────────────────────

  function _anyActive() {
    if (_cfg.stars && (_minRating > 0 || _maxRating < 5)) return true;
    for (const key of Object.keys(FACETS)) {
      if (_cfg[key] && _selected[key].size > 0) return true;
    }
    if (_cfg.notes && _noteQuery) return true;
    if (_cfg.length && _lengthFilter) return true;
    return false;
  }

  function _updateResetBtn() {
    const btn = document.getElementById("filter-reset-btn");
    if (btn) btn.classList.toggle("d-none", !_anyActive());
  }

  function _reset() {
    for (const key of Object.keys(_selected)) _selected[key].clear();
    for (const key of Object.keys(FACETS)) {
      if (_cfg[key]) _buildFacetCheckboxes(key, _countFacetValues(key));
    }
    _minRating = 0;
    _maxRating = 5;
    if (_starSlider) _starSlider.value([0, 5]);
    _noteQuery = "";
    const noteInput = document.getElementById("filter-notes");
    if (noteInput) noteInput.value = "";
    _lengthFilter = "";
    const lengthSelect = document.getElementById("filter-length");
    if (lengthSelect) lengthSelect.value = "";
    _redraw();
    _syncURL();
    _updateResetBtn();
  }

  // ── URL sync ──────────────────────────────────────────────────────────────

  function _syncURL() {
    if (typeof DataUrlState === "undefined") return;
    DataUrlState.setParam("rmin", _minRating > 0 ? String(_minRating) : null);
    DataUrlState.setParam("rmax", _maxRating < 5 ? String(_maxRating) : null);
    for (const [key, facet] of Object.entries(FACETS)) {
      const sel = _selected[key];
      DataUrlState.setParam(facet.param, sel.size ? [...sel].join(",") : null);
    }
    DataUrlState.setParam("note", _noteQuery || null);
    DataUrlState.setParam("length", _lengthFilter || null);
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  function _titleCase(str) {
    return str.replace(/\b\w/g, (c) => c.toUpperCase());
  }

  // ── Star range slider ─────────────────────────────────────────────────────

  let _starSlider = null;

  function _setupStars() {
    const el = document.getElementById("filter-star-slider");
    if (!el || typeof rangeSlider === "undefined") return;
    _starSlider = rangeSlider(el, {
      min: 0,
      max: 5,
      step: 0.5,
      value: [_minRating, _maxRating],
      onInput([min, max], userInteraction) {
        _minRating = min;
        _maxRating = max;
        if (userInteraction) {
          _redraw();
          _syncURL();
          _updateResetBtn();
        }
      },
    });
  }

  // ── Facet multiselect ─────────────────────────────────────────────────────

  // Count distinct values for a facet across all tbody rows.
  function _countFacetValues(key) {
    const { attr, pipe } = FACETS[key];
    const counts = new Map();
    document.querySelectorAll(`#myTable tbody tr[data-${attr}]`).forEach((row) => {
      const raw = row.dataset[attr] || "";
      const vals = pipe ? raw.split("|").filter(Boolean) : raw ? [raw] : [];
      vals.forEach((v) => counts.set(v, (counts.get(v) || 0) + 1));
    });
    return counts;
  }

  // Rebuild the checkbox list for a facet (checked-first, then alphabetical).
  function _buildFacetCheckboxes(key, counts) {
    const menuEl = document.getElementById(`filter-${key}-menu`);
    const btnEl = document.getElementById(`filter-${key}-btn`);
    if (!menuEl) return;

    const sel = _selected[key];
    const baseLabel = _labels[key] || _titleCase(key);

    menuEl.innerHTML = "";

    // Checked items first, then both groups sorted alphabetically
    const entries = [...counts.entries()].sort(([a], [b]) => {
      const diff = (sel.has(a) ? 0 : 1) - (sel.has(b) ? 0 : 1);
      return diff !== 0 ? diff : a.localeCompare(b);
    });

    for (const [val, count] of entries) {
      const li = document.createElement("li");
      const label = document.createElement("label");
      label.className = "dropdown-item d-flex align-items-center gap-2";
      label.style.cssText = "cursor:pointer;user-select:none;";

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = "form-check-input mt-0 flex-shrink-0";
      cb.value = val;
      cb.checked = sel.has(val);
      cb.addEventListener("change", () => {
        if (cb.checked) sel.add(val);
        else sel.delete(val);
        _buildFacetCheckboxes(key, counts);
        _redraw();
        _syncURL();
        _updateResetBtn();
        if (btnEl) {
          btnEl.textContent = sel.size > 0 ? `${baseLabel} (${sel.size})` : baseLabel;
        }
      });

      const span = document.createElement("span");
      span.textContent = `${_titleCase(val)} (${count})`;

      label.append(cb, span);
      li.append(label);
      menuEl.append(li);
    }

    // Keep button label in sync (e.g. after URL restore re-render)
    if (btnEl) {
      btnEl.textContent = sel.size > 0 ? `${baseLabel} (${sel.size})` : baseLabel;
    }
  }

  function _setupFacet(key) {
    const bar = document.getElementById("data-filter-bar");
    const labelAttr = `${key}Label`; // e.g. "genreLabel" ← data-genre-label
    _labels[key] = bar?.dataset[labelAttr] || _titleCase(key);

    const counts = _countFacetValues(key);
    _buildFacetCheckboxes(key, counts);

    // Search within checkbox list
    const searchEl = document.getElementById(`filter-${key}-search`);
    if (searchEl) {
      searchEl.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") e.stopPropagation();
      });
      searchEl.addEventListener("input", () => {
        const q = searchEl.value.toLowerCase();
        document.querySelectorAll(`#filter-${key}-menu li`).forEach((li) => {
          const text = li.querySelector("label span")?.textContent?.toLowerCase() ?? "";
          li.style.display = text.includes(q) ? "" : "none";
        });
      });
    }

    // Clear search box + show all rows when the dropdown opens
    const btnEl = document.getElementById(`filter-${key}-btn`);
    if (btnEl) {
      btnEl.closest(".dropdown")?.addEventListener("show.bs.dropdown", () => {
        if (searchEl) searchEl.value = "";
        document
          .querySelectorAll(`#filter-${key}-menu li`)
          .forEach((li) => (li.style.display = ""));
      });
    }
  }

  // ── Notes search (fragrance) ──────────────────────────────────────────────

  function _setupNotes(input) {
    if (!input) return;
    input.addEventListener("input", () => {
      _noteQuery = input.value.toLowerCase().trim();
      _redraw();
      _syncURL();
      _updateResetBtn();
    });
  }

  // ── Length dropdown (movies) ──────────────────────────────────────────────

  function _refreshLengthCounts(select) {
    let shorts = 0,
      features = 0;
    document.querySelectorAll("#myTable tbody tr[data-runtime]").forEach((row) => {
      const runtime = parseInt(row.dataset.runtime || "0", 10);
      if (runtime > 0 && runtime <= 40) shorts++;
      else if (runtime > 40) features++;
    });
    select.querySelectorAll("option").forEach((opt) => {
      if (opt.value === "short") opt.textContent = `Short ≤40 min (${shorts})`;
      if (opt.value === "feature") opt.textContent = `Feature >40 min (${features})`;
    });
  }

  function _setupLength(select) {
    if (!select) return;
    _refreshLengthCounts(select);
    select.addEventListener("change", () => {
      _lengthFilter = select.value;
      _redraw();
      _syncURL();
      _updateResetBtn();
    });
  }

  // ── URL restore ───────────────────────────────────────────────────────────

  function _restoreFromURL() {
    const params = new URLSearchParams(window.location.search);

    for (const [key, facet] of Object.entries(FACETS)) {
      if (!_cfg[key]) continue;
      const val = params.get(facet.param);
      if (val) {
        val
          .split(",")
          .filter(Boolean)
          .forEach((v) => _selected[key].add(v));
        // Rebuild so restored checkboxes render checked and button label updates
        _buildFacetCheckboxes(key, _countFacetValues(key));
      }
    }

    const note = params.get("note");
    const noteInput = document.getElementById("filter-notes");
    if (note && noteInput) {
      noteInput.value = note;
      _noteQuery = note.toLowerCase().trim();
    }

    const length = params.get("length");
    const lengthSelect = document.getElementById("filter-length");
    if (length && lengthSelect) {
      lengthSelect.value = length;
      _lengthFilter = lengthSelect.value;
    }
  }

  // ── Sort sync ─────────────────────────────────────────────────────────────

  function _setupSortSync() {
    const el = document.getElementById("myTable");
    if (!el || typeof $ === "undefined") return;

    let ready = false;
    let defaultOrder = null;

    function _serializeOrder(order) {
      return order.map(([c, d]) => `${c}:${d}`).join(",");
    }

    $(document).on("init.dt", function (e, settings) {
      if (settings.nTable !== el) return;
      const dt = new DataTable(el);
      defaultOrder = _serializeOrder(dt.order());

      const sortParam = _initParams.get("sort");
      if (sortParam) {
        const cols = sortParam.split(",").flatMap((s) => {
          const [col, dir] = s.split(":");
          const colIdx = parseInt(col, 10);
          return !isNaN(colIdx) && (dir === "asc" || dir === "desc") ? [[colIdx, dir]] : [];
        });
        if (cols.length) dt.order(cols).draw();
      }
      ready = true;
    });

    $(el).on("order.dt", function () {
      if (!ready || typeof DataUrlState === "undefined") return;
      const order = new DataTable(this).order().filter(([, d]) => d === "asc" || d === "desc");
      const serialized = order.length ? _serializeOrder(order) : null;
      DataUrlState.setParam("sort", serialized && serialized !== defaultOrder ? serialized : null);
    });
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  function _setup(cfg) {
    _cfg = cfg;
    if (cfg.stars) _setupStars();
    if (cfg.genre) _setupFacet("genre");
    if (cfg.type) _setupFacet("type");
    if (cfg.mechanism) _setupFacet("mechanism");
    if (cfg.notes) _setupNotes(document.getElementById("filter-notes"));
    if (cfg.length) _setupLength(document.getElementById("filter-length"));
    _restoreFromURL();
    const resetBtn = document.getElementById("filter-reset-btn");
    if (resetBtn) resetBtn.addEventListener("click", _reset);
    _updateResetBtn();
  }

  function init() {
    _setupSortSync();
    const bar = document.getElementById("data-filter-bar");
    if (!bar) return;
    _setup({
      stars: bar.dataset.stars === "true",
      genre: bar.dataset.genres === "true", // note: HTML attr is data-genres
      type: bar.dataset.type === "true",
      mechanism: bar.dataset.mechanism === "true",
      notes: bar.dataset.notes === "true",
      length: bar.dataset.length === "true",
    });
  }

  // Scripts at the bottom of <body> execute before readyState reaches
  // "interactive", but all elements above the script tag are already in the
  // DOM. Always call init() immediately rather than deferring to
  // DOMContentLoaded, which fires after DataTables has already removed
  // off-page rows and would produce wrong counts.
  init();

  return {};
})();
