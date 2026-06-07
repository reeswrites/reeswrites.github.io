"use strict";

/**
 * Generic filter bar for DataTable pages.
 *
 * Auto-inits from #data-filter-bar if present. Reads data-* config attributes:
 *   data-stars="true"   — minimum-star threshold filter
 *   data-genres="true"  — genre dropdown filter
 *   data-notes="true"   — note-ingredient text search (fragrance)
 *   data-type="true"    — type dropdown filter (fragrance)
 *
 * Rows must carry data attributes:
 *   data-rating="4.5"          — numeric rating (stars pages)
 *   data-genre="comedy|drama"  — pipe-separated lowercase genres
 *   data-notes="lavender rose" — space-separated note ingredients (lowercase)
 *   data-type="eau de parfum"  — lowercase type string
 *
 * URL state is synced via DataUrlState (?rating=4&genre=thriller etc.).
 */
const DataFilters = (() => {
  "use strict";

  let _minRating    = 0;
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

      if (_cfg.stars && _minRating > 0) {
        if (parseFloat(tr.dataset.rating || "0") < _minRating) return false;
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
    DataUrlState.setParam("rating",  _minRating    > 0 ? String(_minRating) : null);
    DataUrlState.setParam("genre",   _genre         || null);
    DataUrlState.setParam("note",    _noteQuery     || null);
    DataUrlState.setParam("type",    _typeFilter    || null);
    DataUrlState.setParam("length",  _lengthFilter  || null);
  }

  // ── Star control ──────────────────────────────────────────────────────────

  function _updateStarUI() {
    document.querySelectorAll(".filter-star").forEach((el) => {
      const s = parseInt(el.dataset.star, 10);
      el.style.color = s <= _minRating ? "#f5a623" : "";
      el.classList.toggle("text-muted", s > _minRating);
    });
    const allBtn = document.getElementById("filter-stars-all");
    if (allBtn) {
      allBtn.classList.toggle("btn-secondary",         _minRating === 0);
      allBtn.classList.toggle("btn-outline-secondary", _minRating > 0);
    }
  }

  function _setupStars() {
    _updateStarUI();
    const row = document.getElementById("filter-star-row");
    if (!row) return;

    row.addEventListener("click", (e) => {
      const star = e.target.closest(".filter-star");
      if (!star) return;
      const val = parseInt(star.dataset.star, 10);
      _minRating = val === _minRating ? 0 : val; // click same star → reset
      _updateStarUI();
      _redraw();
      _syncURL();
    });

    const allBtn = document.getElementById("filter-stars-all");
    if (allBtn) {
      allBtn.addEventListener("click", () => {
        _minRating = 0;
        _updateStarUI();
        _redraw();
        _syncURL();
      });
    }
  }

  // ── Genre dropdown ────────────────────────────────────────────────────────

  function _titleCase(str) {
    return str.replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function _populateGenreSelect(select) {
    const genres = new Set();
    document.querySelectorAll("#myTable tbody tr[data-genre]").forEach((row) => {
      row.dataset.genre.split("|").filter(Boolean).forEach((g) => genres.add(g));
    });
    const bar        = document.getElementById("data-filter-bar");
    const genreLabel = (bar?.dataset.genreLabel || "Genre").toLowerCase();
    const allOpt    = document.createElement("option");
    allOpt.value    = "";
    allOpt.textContent = `All ${genreLabel}s`;
    select.appendChild(allOpt);
    [...genres].sort().forEach((g) => {
      const opt       = document.createElement("option");
      opt.value       = g;
      opt.textContent = _titleCase(g);
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
    const types = new Set();
    document.querySelectorAll("#myTable tbody tr[data-type]").forEach((row) => {
      if (row.dataset.type) types.add(row.dataset.type);
    });
    const allOpt    = document.createElement("option");
    allOpt.value    = "";
    allOpt.textContent = "All types";
    select.appendChild(allOpt);
    [...types].sort().forEach((t) => {
      const opt       = document.createElement("option");
      opt.value       = t;
      opt.textContent = _titleCase(t);
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

  function _setupLength(select) {
    if (!select) return;
    select.addEventListener("change", () => {
      _lengthFilter = select.value;
      _redraw();
      _syncURL();
    });
  }

  // ── URL restore ───────────────────────────────────────────────────────────

  function _restoreFromURL() {
    if (typeof DataUrlState === "undefined") return;
    const params = DataUrlState.getParams();

    const rating = parseFloat(params.get("rating") || "0");
    if (rating >= 1 && rating <= 5) {
      _minRating = rating;
      _updateStarUI();
    }

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

  if (document.readyState !== "loading") {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init);
  }

  return {};
})();
