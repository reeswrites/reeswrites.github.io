"use strict";

/**
 * Generic filter bar for DataTable pages.
 *
 * Auto-inits from #data-filter-bar if present. Reads data-* config attributes:
 *   data-stars="true"   — minimum-star threshold filter
 *   data-genres="true"  — genre dropdown filter
 *   data-notes="true"   — note-ingredient text search (fragrance)
 *   data-type="true"    — type dropdown filter (fragrance)
 *   data-length="true"  — short/feature length filter (movies)
 *
 * Rows must carry data attributes:
 *   data-rating="4.5"          — numeric rating (stars pages)
 *   data-genre="comedy|drama"  — pipe-separated lowercase genres
 *   data-notes="lavender rose" — space-separated note ingredients (lowercase)
 *   data-type="eau de parfum"  — lowercase type string
 *   data-runtime="95"          — integer minutes (length pages)
 *
 * URL state is synced via DataUrlState (?rmin=3&rmax=5&genre=thriller etc.).
 *
 * Call DataFilters.refreshCounts(table) after new DataTable() to populate
 * dropdown counts from all rows (not just the current DOM page).
 */
const DataFilters = (() => {
  "use strict";

  const _initParams  = new URLSearchParams(window.location.search);
  let _minRating    = parseFloat(_initParams.get("rmin") || "0");
  let _maxRating    = parseFloat(_initParams.get("rmax") || "5");
  let _genre        = "";
  let _noteQuery    = "";
  let _typeFilter   = "";
  let _lengthFilter = "";
  let _cfg          = {};

  // ── DataTables custom search (global, scoped to #myTable) ────────────────

  if (typeof DataTable !== "undefined") {
    DataTable.ext.search.push(function (settings, _data, _idx) {
      if (settings.nTable.id !== "myTable") return true;

      // DataTables passes row data (not the TR element) as the 4th arg.
      // Access the actual TR node via aoData for data-* attribute reads.
      const tr = settings.aoData[_idx]?.nTr;
      if (!tr) return true;

      if (_cfg.stars && (_minRating > 0 || _maxRating < 5)) {
        const r = parseFloat(tr.dataset.rating || "0");
        if (r < _minRating || r > _maxRating) return false;
      }
      if (_cfg.genres && _genre) {
        const genres = (tr.dataset.genre || "").split("|").filter(Boolean);
        if (!genres.includes(_genre)) return false;
      }
      if (_cfg.notes && _noteQuery) {
        if (!(tr.dataset.notes || "").includes(_noteQuery)) return false;
      }
      if (_cfg.type && _typeFilter) {
        if ((tr.dataset.type || "") !== _typeFilter) return false;
      }
      if (_cfg.length && _lengthFilter) {
        const runtime = parseInt(tr.dataset.runtime || "0", 10);
        if (_lengthFilter === "short"   && !(runtime > 0 && runtime <= 40)) return false;
        if (_lengthFilter === "feature" && (runtime > 0 && runtime <= 40))  return false;
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

  // ── URL sync ──────────────────────────────────────────────────────────────

  function _syncURL() {
    if (typeof DataUrlState === "undefined") return;
    DataUrlState.setParam("rmin",    _minRating > 0 ? String(_minRating) : null);
    DataUrlState.setParam("rmax",    _maxRating < 5 ? String(_maxRating) : null);
    DataUrlState.setParam("genre",   _genre         || null);
    DataUrlState.setParam("note",    _noteQuery     || null);
    DataUrlState.setParam("type",    _typeFilter    || null);
    DataUrlState.setParam("length",  _lengthFilter  || null);
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
        }
      },
    });
  }

  // ── Genre dropdown ────────────────────────────────────────────────────────

  function _titleCase(str) {
    return str.replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function _populateGenreSelect(select) {
    const counts = new Map();
    document.querySelectorAll("#myTable tbody tr[data-genre]").forEach((row) => {
      (row.dataset.genre || "").split("|").filter(Boolean).forEach((g) => {
        counts.set(g, (counts.get(g) || 0) + 1);
      });
    });
    const bar        = document.getElementById("data-filter-bar");
    const genreLabel = (bar?.dataset.genreLabel || "Genre").toLowerCase();
    const allOpt    = document.createElement("option");
    allOpt.value    = "";
    allOpt.textContent = `All ${genreLabel}s`;
    select.appendChild(allOpt);
    [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).forEach(([g, n]) => {
      const opt       = document.createElement("option");
      opt.value       = g;
      opt.textContent = `${_titleCase(g)} (${n})`;
      select.appendChild(opt);
    });
  }

  function _setupGenre(select) {
    if (!select) return;
    _populateGenreSelect(select);
    select.addEventListener("change", () => {
      _genre = select.value;
      _redraw();
      _syncURL();
    });
  }

  // ── Notes search (fragrance) ──────────────────────────────────────────────

  function _setupNotes(input) {
    if (!input) return;
    input.addEventListener("input", () => {
      _noteQuery = input.value.toLowerCase().trim();
      _redraw();
      _syncURL();
    });
  }

  // ── Type dropdown (fragrance) ─────────────────────────────────────────────

  function _populateTypeSelect(select) {
    const counts = new Map();
    document.querySelectorAll("#myTable tbody tr[data-type]").forEach((row) => {
      if (row.dataset.type) counts.set(row.dataset.type, (counts.get(row.dataset.type) || 0) + 1);
    });
    const allOpt    = document.createElement("option");
    allOpt.value    = "";
    allOpt.textContent = "All types";
    select.appendChild(allOpt);
    [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).forEach(([t, n]) => {
      const opt       = document.createElement("option");
      opt.value       = t;
      opt.textContent = `${_titleCase(t)} (${n})`;
      select.appendChild(opt);
    });
  }

  function _setupType(select) {
    if (!select) return;
    _populateTypeSelect(select);
    select.addEventListener("change", () => {
      _typeFilter = select.value;
      _redraw();
      _syncURL();
    });
  }

  // ── Length dropdown (movies) ──────────────────────────────────────────────

  function _refreshLengthCounts(select) {
    let shorts = 0, features = 0;
    document.querySelectorAll("#myTable tbody tr[data-runtime]").forEach((row) => {
      const runtime = parseInt(row.dataset.runtime || "0", 10);
      if (runtime > 0 && runtime <= 40) shorts++;
      else if (runtime > 40) features++;
    });
    select.querySelectorAll("option").forEach((opt) => {
      if (opt.value === "short")   opt.textContent = `Short ≤40 min (${shorts})`;
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
    });
  }

  // ── URL restore ───────────────────────────────────────────────────────────

  function _restoreFromURL() {
    const params = new URLSearchParams(window.location.search);

    const genre       = params.get("genre");
    const genreSelect = document.getElementById("filter-genre");
    if (genre && genreSelect) {
      genreSelect.value = genre;
      _genre = genreSelect.value; // "" if not in options
    }

    const note      = params.get("note");
    const noteInput = document.getElementById("filter-notes");
    if (note && noteInput) {
      noteInput.value = note;
      _noteQuery      = note.toLowerCase().trim();
    }

    const type       = params.get("type");
    const typeSelect = document.getElementById("filter-type");
    if (type && typeSelect) {
      typeSelect.value = type;
      _typeFilter      = typeSelect.value;
    }

    const length       = params.get("length");
    const lengthSelect = document.getElementById("filter-length");
    if (length && lengthSelect) {
      lengthSelect.value = length;
      _lengthFilter      = lengthSelect.value;
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
          return !isNaN(colIdx) && (dir === "asc" || dir === "desc")
            ? [[colIdx, dir]]
            : [];
        });
        if (cols.length) dt.order(cols).draw();
      }
      ready = true;
    });

    $(el).on("order.dt", function () {
      if (!ready || typeof DataUrlState === "undefined") return;
      const order = new DataTable(this).order().filter(([, d]) => d === "asc" || d === "desc");
      const serialized = order.length ? _serializeOrder(order) : null;
      DataUrlState.setParam(
        "sort",
        serialized && serialized !== defaultOrder ? serialized : null
      );
    });
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  function _setup(cfg) {
    _cfg = cfg;
    if (cfg.stars)  _setupStars();
    if (cfg.genres) _setupGenre(document.getElementById("filter-genre"));
    if (cfg.notes)  _setupNotes(document.getElementById("filter-notes"));
    if (cfg.type)   _setupType(document.getElementById("filter-type"));
    if (cfg.length) _setupLength(document.getElementById("filter-length"));
    _restoreFromURL();
  }

  function init() {
    _setupSortSync();
    const bar = document.getElementById("data-filter-bar");
    if (!bar) return;
    _setup({
      stars:  bar.dataset.stars   === "true",
      genres: bar.dataset.genres  === "true",
      notes:  bar.dataset.notes   === "true",
      type:   bar.dataset.type    === "true",
      length: bar.dataset.length  === "true",
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
