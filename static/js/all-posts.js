// ─── State ────────────────────────────────────────────────────────────────
let globalSearchQuery = "";
let globalSortMode = "relevance"; // "date" | "relevance"
let globalView = "cards"; // "cards" | "shelf"

const globalFilters = {
  types: [],
  tags: [],
};

// ─── Spine size encoding ──────────────────────────────────────────────────
// "jitter" = organic ±20% height/width variation seeded from post URL (stable
// across renders — same post always gets the same dimensions).
// Future: change to "word-count" to encode reading length in spine height.
const SPINE_ENCODING = "jitter";

// ─── Element refs ─────────────────────────────────────────────────────────
const cardGridEl = document.getElementById("card_grid");
const shelfViewEl = document.getElementById("shelf_view");
const featuredPostsEl = document.getElementById("spotlights");
const spotlightGridEl = document.getElementById("spotlight_grid");
const scrollToTopBtn = document.getElementById("btn-back-to-top");
const randomPostBtn = document.getElementById("randomPostBtn");
const postTypeOdomoterEl = document.getElementById("postTypeOdomoter");
const filterHintEl = document.getElementById("filterHelp");
const filterViewEl = document.getElementById("filterView");
const clearFiltersBtn = document.getElementById("clearFilters");
const activeFiltersListEl = document.getElementById("activeFilters");
const shareFiltersBtn = document.getElementById("shareFilters");
const searchInputEl = document.getElementById("searchInput");
const sortByDateBtn = document.getElementById("sortByDate");
const sortByRelevanceBtn = document.getElementById("sortByRelevance");

// ─── Post data (injected by Jekyll/Liquid via window.POSTS_DATA) ──────────
const posts = (window.POSTS_DATA || []).map((p) => {
  const [y, m, d] = p.date.split("-").map(Number);
  return {
    ...p,
    title: p.title || "",
    description: p.description || "",
    content: p.content || "",
    date: new Date(y, m - 1, d), // local midnight, matches original behavior
    tags: p.tags ? p.tags.split(",") : [], // comma-joined string → array
  };
});

// Unique post types and tags derived from post data
const postTypes = posts.map((x) => x.type).filter((v, i, a) => a.indexOf(v) === i);

const postTags = posts.flatMap((x) => x.tags).filter((v, i, a) => a.indexOf(v) === i);

// ─── Fetch cache (for reading modal) ─────────────────────────────────────
const _fetchCache = new Map(); // url → #content innerHTML

async function fetchPostContent(url) {
  if (_fetchCache.has(url)) return _fetchCache.get(url);
  const res = await fetch(url);
  const text = await res.text();
  const doc = new DOMParser().parseFromString(text, "text/html");
  const html =
    doc.querySelector("#content")?.innerHTML ?? "<p class='text-muted'>Could not load post.</p>";
  _fetchCache.set(url, html);
  return html;
}

// ─── Tag checkbox dropdown ────────────────────────────────────────────────
function initializeTagSelect() {
  renderTagCheckboxes();

  document.getElementById("tagSearch").addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") e.stopPropagation();
  });
  document.getElementById("tagSearch").addEventListener("input", filterTagMenu);

  // Clear the search input each time the dropdown opens
  document.getElementById("tagFilterBtn").addEventListener("show.bs.dropdown", () => {
    document.getElementById("tagSearch").value = "";
    filterTagMenu();
  });
}

function filterTagMenu() {
  const q = document.getElementById("tagSearch").value.toLowerCase();
  document.querySelectorAll("#tagFilterMenu li").forEach((li) => {
    const text = li.querySelector("label")?.textContent?.toLowerCase() ?? "";
    li.style.display = text.includes(q) ? "" : "none";
  });
}

function renderTagCheckboxes() {
  const menu = document.getElementById("tagFilterMenu");
  const btn = document.getElementById("tagFilterBtn");
  const selected = globalFilters.tags.filter((t) => !/^\d{4}$/.test(t));

  const allTags = postTags
    .filter((tag) => !/^\d{4}$/.test(tag.trim()))
    .sort((a, b) => a.localeCompare(b));

  // Checked items float to top, unchecked remain alphabetical
  const sorted = [
    ...allTags.filter((t) => selected.includes(t.trim().toLowerCase())),
    ...allTags.filter((t) => !selected.includes(t.trim().toLowerCase())),
  ];

  menu.innerHTML = "";
  sorted.forEach((tag) => {
    const val = tag.trim().toLowerCase();
    const li = document.createElement("li");
    const label = document.createElement("label");
    label.className = "dropdown-item d-flex align-items-center gap-2";
    label.style.cursor = "pointer";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "form-check-input mt-0 flex-shrink-0";
    cb.value = val;
    cb.checked = selected.includes(val);
    cb.addEventListener("change", () => toggleFilter("tags", val));

    label.appendChild(cb);
    label.appendChild(document.createTextNode(tag.trim()));
    li.appendChild(label);
    menu.appendChild(li);
  });

  btn.textContent =
    selected.length > 0
      ? `${selected.length} tag${selected.length > 1 ? "s" : ""} selected`
      : "Filter by tags";

  filterTagMenu();
}

// ─── Init ─────────────────────────────────────────────────────────────────
(function initUI() {
  randomPostBtn.onclick = scrollToRandomCard;
  clearFiltersBtn.onclick = clearFilters;
  shareFiltersBtn.onclick = copyShareLink;
  scrollToTopBtn.onclick = scrollToTop;

  addScrollSpy();
  animateSearchPlaceholder();
  initializeTagSelect();

  // Debounced search
  searchInputEl.addEventListener(
    "input",
    debounce((e) => {
      globalSearchQuery = e.target.value.trim().toLowerCase();
      updateSortControlsVisibility();
      encodeStateToURL();
      renderActiveView();
    }, 250),
  );

  // Handle the native clear (×) button on type="search"
  searchInputEl.addEventListener("search", () => {
    if (searchInputEl.value === "") {
      globalSearchQuery = "";
      updateSortControlsVisibility();
      encodeStateToURL();
      renderActiveView();
    }
  });

  // Back/forward navigation
  window.addEventListener("popstate", () => {
    globalSearchQuery = "";
    globalSortMode = "relevance";
    globalView = "cards";
    globalFilters.types = [];
    globalFilters.tags = [];
    searchInputEl.value = "";
    renderTagCheckboxes();

    _applySortButtonStyles();
    _applyViewButtonStyles();
    processURLParams();
    renderActiveView();
  });

  window.addEventListener("resize", debounce(() => {
    if (globalView === "shelf") renderShelf();
  }, 200));

  processURLParams();
  renderFeaturedPosts();
  renderActiveView();
})();

// ─── URL state ────────────────────────────────────────────────────────────

/**
 * Encode all navigable state into URL query params.
 * Order: types → tags → view → sort → q (always last, to avoid any parsing
 * ambiguity with free-text search content that may contain special chars).
 */
function encodeStateToURL() {
  const params = new URLSearchParams();

  if (globalFilters.types.length > 0) params.set("types", globalFilters.types.join(","));
  if (globalFilters.tags.length > 0) params.set("tags", globalFilters.tags.join(","));
  if (globalView !== "cards") params.set("view", globalView);

  if (globalSearchQuery) {
    params.set("sort", globalSortMode);
    params.set("q", globalSearchQuery);
  }

  const search = params.toString();
  history.replaceState(null, null, window.location.pathname + (search ? `?${search}` : ""));
}

/**
 * Restore all state from URL query params on load or popstate.
 * q is read via keyed lookup so its position in the URL string is
 * irrelevant — URLSearchParams.get() is always key-based.
 */
function processURLParams() {
  const params = new URLSearchParams(window.location.search);

  const types = params.get("types");
  const tags = params.get("tags");
  const sort = params.get("sort");
  const q = params.get("q");
  const view = params.get("view");

  if (types)
    types
      .split(",")
      .filter(Boolean)
      .forEach((t) => {
        if (postTypes.map((x) => x.toLowerCase()).includes(t)) globalFilters.types.push(t);
      });

  if (tags)
    tags
      .split(",")
      .filter(Boolean)
      .forEach((t) => {
        if (postTags.map((x) => x.toLowerCase()).includes(t)) globalFilters.tags.push(t);
      });

  if (sort) globalSortMode = sort;
  _applySortButtonStyles();

  if (view === "shelf") globalView = "shelf";
  _applyViewButtonStyles();

  if (q) {
    globalSearchQuery = q;
    searchInputEl.value = q;
  }

  // Sync all dependent UI
  updateSortControlsVisibility();

  const hasFilters = globalFilters.types.length > 0 || globalFilters.tags.length > 0;
  filterViewEl.classList.toggle("d-none", !hasFilters);
  filterHintEl.classList.toggle("d-none", hasFilters);
  activeFiltersListEl.innerText = [...globalFilters.types, ...globalFilters.tags]
    .map(titleCase)
    .join(", ");

  renderTagCheckboxes();
}

// ─── Sort controls ────────────────────────────────────────────────────────

/**
 * Show sort buttons only when a query is active AND we're in cards view.
 * The shelf is always date-ordered so sort controls don't apply.
 */
function updateSortControlsVisibility() {
  const hasQuery = globalSearchQuery.length > 0 && globalView === "cards";
  document.getElementById("sortControls").classList.toggle("d-none", !hasQuery);
}

/**
 * Switch sort mode and re-render.
 */
// oxlint-disable-next-line no-unused-vars
function setSortMode(mode) {
  globalSortMode = mode;
  _applySortButtonStyles();
  encodeStateToURL();
  renderActiveView();
}

/**
 * Update the active/inactive visual state of the sort buttons.
 */
function _applySortButtonStyles() {
  const dateActive = globalSortMode === "date";
  sortByDateBtn.classList.toggle("btn-secondary", dateActive);
  sortByDateBtn.classList.toggle("btn-outline-secondary", !dateActive);
  sortByRelevanceBtn.classList.toggle("btn-secondary", !dateActive);
  sortByRelevanceBtn.classList.toggle("btn-outline-secondary", dateActive);
}

// ─── View toggle ──────────────────────────────────────────────────────────

/**
 * Switch between "cards" and "shelf" views, encoding the choice in the URL.
 */
// oxlint-disable-next-line no-unused-vars
function setView(view) {
  const scrollY = window.scrollY;
  globalView = view;
  _applyViewButtonStyles();
  encodeStateToURL();
  updateSortControlsVisibility();
  renderActiveView();
  requestAnimationFrame(() => window.scrollTo({ top: scrollY, behavior: "instant" }));
}

/**
 * Update the active/inactive visual state of the view toggle buttons.
 */
function _applyViewButtonStyles() {
  const isShelf = globalView === "shelf";
  document.getElementById("viewCards").classList.toggle("btn-secondary", !isShelf);
  document.getElementById("viewCards").classList.toggle("btn-outline-secondary", isShelf);
  document.getElementById("viewShelf").classList.toggle("btn-secondary", isShelf);
  document.getElementById("viewShelf").classList.toggle("btn-outline-secondary", !isShelf);
}

/**
 * Show/hide the correct view container and delegate to the right render fn.
 * Also refreshes the odometer pill counts (shared by both views).
 */
function renderActiveView() {
  const isShelf = globalView === "shelf";
  // Show the incoming view before hiding the outgoing one so the page never
  // shrinks below the current scroll position (which would cause scroll clamping).
  if (isShelf) {
    shelfViewEl.classList.remove("d-none");
    cardGridEl.classList.add("d-none");
    renderShelf();
  } else {
    cardGridEl.classList.remove("d-none");
    shelfViewEl.classList.add("d-none");
    renderGardenPosts();
  }
  renderOdometers();
}

// ─── Shared filter core ───────────────────────────────────────────────────

/**
 * Return the filtered + sorted post array reflecting all active state:
 * type filters, tag filters, search query, and sort mode.
 * Used by both the cards view, shelf view, and odometer counts.
 */
function getFilteredPosts() {
  const query = globalSearchQuery;

  return (
    posts
      .filter((post) => globalFilters.types.length === 0 || globalFilters.types.includes(post.type))
      .filter(
        (post) =>
          globalFilters.tags.length === 0 ||
          post.tags.map((x) => x.toLowerCase()).some((tag) => globalFilters.tags.includes(tag)),
      )
      .filter((post) => {
        if (!query) return true;
        return (
          post.title.toLowerCase().includes(query) ||
          post.description.toLowerCase().includes(query) ||
          post.tags.some((t) => t.toLowerCase().includes(query)) ||
          post.content.toLowerCase().includes(query)
        );
      })
      // TODO can optimize by only scoring posts that match and doing a single sort pass
      .sort((a, b) => {
        if (globalSortMode === "relevance" && query) {
          const diff = scorePost(b, query) - scorePost(a, query);
          return diff !== 0 ? diff : b.date - a.date;
        }
        return b.date - a.date;
      })
  );
}

// ─── Scoring ──────────────────────────────────────────────────────────────

/**
 * Score a post against the search query for relevance sorting.
 *
 * Tiers:
 *   Title exact match          +1000
 *   Title starts with query    +500
 *   Title contains query       +200  (per occurrence)
 *   Tag exact match            +150  (per tag)
 *   Tag contains query         +75   (per tag)
 *   Description contains query +40   (per occurrence)
 *   Content contains query     +10   (per occurrence, capped at +100)
 */
function scorePost(post, query) {
  if (!query) return 0;

  const q = query.toLowerCase();
  const re = new RegExp(escapeRegex(q), "g");
  let score = 0;

  const title = post.title.toLowerCase();
  if (title === q) score += 1000;
  else if (title.startsWith(q)) score += 500;
  score += (title.match(re) || []).length * 200;

  post.tags.forEach((tag) => {
    const t = tag.toLowerCase();
    if (t === q) score += 150;
    else if (t.includes(q)) score += 75;
  });

  score += (post.description.toLowerCase().match(re) || []).length * 40;
  score += Math.min((post.content.toLowerCase().match(re) || []).length * 10, 100);

  return score;
}

// ─── Render: featured posts ───────────────────────────────────────────────
function renderFeaturedPosts() {
  const today = new Date();
  const onThisDay = posts.filter(
    (post) => post.date.getMonth() === today.getMonth() && post.date.getDate() === today.getDate(),
  );

  if (onThisDay.length > 0) {
    featuredPostsEl.classList.remove("d-none");
    onThisDay.forEach((post) => renderPostCard(spotlightGridEl, post, "On This Day", true));
  }

  new Masonry(spotlightGridEl, { itemSelector: ".col", percentPosition: true });
}

// ─── Render: garden posts (cards view) ───────────────────────────────────
function renderGardenPosts() {
  cardGridEl.innerHTML = "";

  const filtered = getFilteredPosts();
  const query = globalSearchQuery;

  filtered.forEach((post) => renderPostCard(cardGridEl, post, null, true, true, query));

  if (filtered.length === 0) {
    createElement(cardGridEl, "p", {
      class: "text-muted mt-2",
      text: query
        ? `No posts matched "${query}" with the current filters.`
        : "No posts match the current filters.",
    });
    return;
  }

  new Masonry(cardGridEl, { itemSelector: ".col", percentPosition: true });
}

// ─── Render: single post card ─────────────────────────────────────────────
function renderPostCard(
  parentEl,
  post,
  headerText = "",
  showDescription = false,
  showTags = false,
  query = "",
) {
  const card = createElement(createElement(parentEl, "div", { class: "col" }), "div", {
    class: "card",
  });

  if (headerText) {
    createElement(card, "div", { class: "card-header", text: headerText });
  }

  const cardBody = createElement(card, "div", { class: "card-body d-flex flex-column" });

  // Title
  createElement(createElement(cardBody, "p", { class: "mb-1" }), "a", {
    href: post.url,
    innerHTML: query ? highlight(post.title, query) : escapeHtml(post.title),
  });

  // Description + excerpt logic
  if (showDescription) {
    // Determine if the match is body-only (i.e. an excerpt will be shown)
    const inTitle = query && post.title.toLowerCase().includes(query);
    const inDesc = query && post.description.toLowerCase().includes(query);
    const inTags = query && post.tags.some((t) => t.toLowerCase().includes(query));
    const excerpt =
      query && !inTitle && !inDesc && !inTags ? getExcerpt(post.content, query, 30) : null;

    if (excerpt) {
      // Body-only match — show excerpt instead of description
      createElement(cardBody, "p", {
        class: "mb-1 text-muted fst-italic small",
        innerHTML: `…${excerpt}…`,
      });
    } else {
      // No excerpt — show description as normal (with highlight if query matches it)
      createElement(cardBody, "p", {
        class: "mb-1",
        innerHTML: query ? highlight(post.description, query) : escapeHtml(post.description),
      });
    }
  }

  // Tags + type badges
  if (showTags) {
    const p = createElement(cardBody, "p", { class: "mb-0" });

    createElement(p, "span", {
      class: "badge bg-secondary me-1 text-start",
      innerHTML: query ? highlight(titleCase(post.type), query) : escapeHtml(titleCase(post.type)),
      style: "cursor: pointer; text-wrap: auto;",
      title: `Filter to ${post.type} posts`,
      onclick: () => toggleFilter("types", post.type),
    });

    post.tags
      .sort((a, b) => a.length - b.length)
      .forEach((tag) => {
        createElement(p, "span", {
          class: "badge bg-secondary me-1 text-start",
          innerHTML: query ? highlight(titleCase(tag), query) : escapeHtml(titleCase(tag)),
          style: "cursor: pointer; text-wrap: auto;",
          title: `Filter to ${tag} posts`,
          onclick: () => toggleFilter("tags", tag),
        });
      });
  }

  createElement(card, "div", {
    class: "card-footer",
    text: `Published: ${timeago.format(post.date)}`,
  });
}

// ─── Render: shelf view ───────────────────────────────────────────────────

/** Deterministic hash → float in [0, 1), stable for a given string. */
function hashFloat(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return ((h >>> 0) % 1000) / 1000;
}

/**
 * Return {height, width} pixel values for a spine based on SPINE_ENCODING.
 * In "jitter" mode: each post gets a stable randomized size seeded off its URL
 * so the shelf looks organic but re-renders identically.
 */
function spineSize(post) {
  if (SPINE_ENCODING === "jitter") {
    const rh = hashFloat(post.url);
    const rw = hashFloat(post.url + "\x01w");
    return {
      height: Math.round(118 + rh * 46), // 118–164 px
      width: Math.round(42 + rw * 16), // 42–58 px
    };
  }
  return { height: 140, width: 48 };
}

/** Render a color legend for the post types present in the current filtered set. */
function renderShelfLegend(filtered) {
  const TYPE_COLORS = {
    article: "#4a84c2",
    stub: "#6e8090",
    notes: "#3a9c65",
    list: "#d4883a",
    project: "#ac3a3a",
    essay: "#7a4db0",
    recipe: "#9e6622",
  };

  const typesPresent = [...new Set(filtered.map((p) => p.type))].sort();
  const legend = createElement(shelfViewEl, "div", { class: "shelf-legend" });

  typesPresent.forEach((type) => {
    const item = createElement(legend, "span", {
      class: "shelf-legend-item",
      title: `Filter to ${type} posts`,
      onclick: () => toggleFilter("types", type),
    });
    const swatch = createElement(item, "span", { class: "shelf-legend-swatch" });
    swatch.style.background = TYPE_COLORS[type] ?? "#888";
    createElement(item, "span", { text: titleCase(type) });
  });
}

function renderShelf() {
  shelfViewEl.querySelectorAll('[data-bs-toggle="tooltip"]').forEach((el) => {
    bootstrap.Tooltip.getInstance(el)?.dispose();
  });
  shelfViewEl.innerHTML = "";

  const filtered = getFilteredPosts();

  if (filtered.length === 0) {
    createElement(shelfViewEl, "p", {
      class: "text-muted mt-2",
      text: globalSearchQuery
        ? `No posts matched "${globalSearchQuery}" with the current filters.`
        : "No posts match the current filters.",
    });
    return;
  }

  renderShelfLegend(filtered);

  // Each .bookshelf-row gets its own shelf board — pack spines into rows manually
  // so each row div is a separate element rather than one giant wrapping flex container.
  const GAP = 2; // matches CSS gap: 2px
  const ROW_PADDING = 16; // .bookshelf-row padding: 0 8px → 8+8 = 16px
  const availableWidth = shelfViewEl.offsetWidth - ROW_PADDING;

  let currentRow = null;
  let rowWidth = 0;

  filtered.forEach((post) => {
    const size = spineSize(post);

    if (!currentRow || rowWidth + size.width + GAP > availableWidth) {
      currentRow = createElement(shelfViewEl, "div", { class: "bookshelf-row" });
      rowWidth = 0;
    }

    const spine = document.createElement("div");
    spine.className = "book-spine";
    spine.dataset.type = post.type;
    spine.style.height = size.height + "px";
    spine.style.width = size.width + "px";

    const tooltipLines = [
      `<strong>${escapeHtml(post.title)}</strong>`,
      post.description ? `<span>${escapeHtml(post.description)}</span>` : null,
      `<em class="small">${escapeHtml(titleCase(post.type))} · ${post.date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}</em>`,
    ].filter(Boolean).join("<br>");
    spine.setAttribute("data-bs-toggle", "tooltip");
    spine.setAttribute("data-bs-html", "true");
    spine.setAttribute("data-bs-placement", "auto");
    spine.setAttribute("title", tooltipLines);

    const label = document.createElement("span");
    label.className = "spine-title";
    label.textContent = post.title;
    spine.appendChild(label);

    spine.addEventListener("click", () => openShelfModal(post, spine));
    currentRow.appendChild(spine);
    rowWidth += size.width + GAP;
  });

  if (typeof bootstrap !== "undefined") {
    shelfViewEl.querySelectorAll('[data-bs-toggle="tooltip"]').forEach((el) => {
      new bootstrap.Tooltip(el, { trigger: "hover" });
    });
  }
}

// oxlint-disable-next-line no-unused-vars
function initShelfTooltips() {
  document.querySelectorAll('#shelf_view [data-bs-toggle="tooltip"]').forEach((el) => {
    if (!bootstrap.Tooltip.getInstance(el)) new bootstrap.Tooltip(el, { trigger: "hover" });
  });
}

// ─── Reading modal ─────────────────────────────────────────────────────────

// Matches the barrel-gradient spine colors in all_posts.html CSS
const SPINE_COVER_GRADIENTS = {
  article: "linear-gradient(160deg, #1e3e62 0%, #2a5280 30%, #4a84c2 60%, #2a5280 100%)",
  stub:    "linear-gradient(160deg, #2e3c47 0%, #445260 30%, #6a808e 60%, #445260 100%)",
  notes:   "linear-gradient(160deg, #173d29 0%, #235c3e 30%, #3a9c65 60%, #235c3e 100%)",
  list:    "linear-gradient(160deg, #5c3510 0%, #8a521a 30%, #c47c30 60%, #8a521a 100%)",
  project: "linear-gradient(160deg, #3d1212 0%, #6a2020 30%, #a43434 60%, #6a2020 100%)",
  essay:   "linear-gradient(160deg, #2a1940 0%, #472c6e 30%, #7248ac 60%, #472c6e 100%)",
  recipe:  "linear-gradient(160deg, #381f08 0%, #5c3610 30%, #8e5a20 60%, #5c3610 100%)",
};

let _activeSpine = null;

function openShelfModal(post, spineEl) {
  // Tilt the spine out (existing pull-off-shelf animation)
  if (_activeSpine && _activeSpine !== spineEl) _activeSpine.classList.remove("pulling");
  _activeSpine = spineEl;
  spineEl.classList.add("pulling");
  spineEl.addEventListener("animationend", () => spineEl.classList.remove("pulling"), {
    once: true,
  });

  // Dismiss any lingering tooltip before the cover animation starts
  bootstrap.Tooltip.getInstance(spineEl)?.hide();

  // Capture spine position before the pull animation displaces it
  const spineRect = spineEl.getBoundingClientRect();

  // Pre-populate modal and start fetching content
  document.getElementById("shelfReadModalTitle").textContent = post.title;
  document.getElementById("shelfReadModalLink").href = post.url;
  document.getElementById("shelfReadModalBody").innerHTML =
    `<div class="text-center py-5"><div class="spinner-border text-secondary" role="status"><span class="visually-hidden">Loading…</span></div></div>`;
  fetchPostContent(post.url)
    .then((html) => { document.getElementById("shelfReadModalBody").innerHTML = html; })
    .catch(() => { document.getElementById("shelfReadModalBody").innerHTML = `<p class="text-muted">Could not load post.</p>`; });

  // ── Phase 1: FLIP — expand a book cover from the spine to the viewport center ──
  const coverW = Math.min(380, window.innerWidth * 0.88);
  const coverH = Math.min(500, window.innerHeight * 0.78);
  const coverX = (window.innerWidth  - coverW) / 2;
  const coverY = (window.innerHeight - coverH) / 2;

  const cover = document.createElement("div");
  Object.assign(cover.style, {
    position: "fixed",
    zIndex: "1065",
    left: spineRect.left + "px",
    top:  spineRect.top  + "px",
    width:  spineRect.width  + "px",
    height: spineRect.height + "px",
    background: SPINE_COVER_GRADIENTS[post.type] ?? "linear-gradient(160deg,#222,#555)",
    borderRadius: "3px",
    boxShadow: "2px 4px 16px rgba(0,0,0,0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    transformOrigin: "left center",
    willChange: "transform, left, top, width, height",
    // Subtle linen texture matching the spines
    backgroundBlendMode: "overlay",
  });

  // Inner content — hidden until cover is fully expanded
  const inner = document.createElement("div");
  Object.assign(inner.style, {
    opacity: "0",
    transition: "opacity 0.2s ease",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "14px",
    padding: "28px",
    color: "rgba(255,255,255,0.93)",
    textAlign: "center",
    textShadow: "0 2px 8px rgba(0,0,0,0.55)",
    maxWidth: "100%",
  });

  const titleEl = document.createElement("h2");
  titleEl.textContent = post.title;
  Object.assign(titleEl.style, {
    fontStyle: "italic",
    fontSize: "clamp(1.1rem, 4.5vw, 1.65rem)",
    fontWeight: "700",
    margin: "0",
    lineHeight: "1.3",
  });

  const rule = document.createElement("hr");
  Object.assign(rule.style, {
    width: "55%", border: "none",
    borderTop: "1px solid rgba(255,255,255,0.4)", margin: "0",
  });

  const metaEl = document.createElement("p");
  metaEl.textContent = `${titleCase(post.type)} · ${post.date.toLocaleDateString("en-US", { year: "numeric", month: "long" })}`;
  Object.assign(metaEl.style, {
    margin: "0", fontSize: "0.8rem",
    opacity: "0.75", letterSpacing: "0.08em", textTransform: "uppercase",
  });

  inner.append(titleEl, rule, metaEl);
  cover.appendChild(inner);
  document.body.appendChild(cover);

  // FLIP: animate from spine rect → centered cover
  requestAnimationFrame(() => {
    cover.style.transition = [
      "left 0.3s cubic-bezier(0.22,1,0.36,1)",
      "top 0.3s cubic-bezier(0.22,1,0.36,1)",
      "width 0.3s cubic-bezier(0.22,1,0.36,1)",
      "height 0.3s cubic-bezier(0.22,1,0.36,1)",
      "box-shadow 0.3s ease",
    ].join(",");
    cover.style.left   = coverX + "px";
    cover.style.top    = coverY + "px";
    cover.style.width  = coverW + "px";
    cover.style.height = coverH + "px";
    cover.style.boxShadow = "8px 16px 60px rgba(0,0,0,0.65)";

    // Fade in cover text once expanded
    setTimeout(() => { inner.style.opacity = "1"; }, 240);

    // ── Phase 2: book opens — rotateY from left edge (the binding) ──
    setTimeout(() => {
      cover.style.transition = "transform 0.38s ease-in, opacity 0.15s 0.26s ease";
      cover.style.transform  = "perspective(1400px) rotateY(-90deg)";
      cover.style.opacity    = "0";

      // Show the modal as the cover swings open — no Bootstrap fade (cover IS the entrance)
      const modalEl = document.getElementById("shelfReadModal");
      modalEl.classList.remove("fade");
      bootstrap.Modal.getOrCreateInstance(modalEl).show();
      modalEl.addEventListener("hidden.bs.modal", () => {
        modalEl.classList.add("fade");
      }, { once: true });

      // Remove cover after it's fully gone
      setTimeout(() => cover.remove(), 420);
    }, 750); // hold long enough to read the title before swinging open
  });
}

// ─── Render: odometer filter buttons ─────────────────────────────────────
function renderOdometers() {
  postTypeOdomoterEl.innerHTML = "";

  // Re-use getFilteredPosts() — same filtered base as the active view
  const filteredBase = getFilteredPosts();

  const postCountsByType = filteredBase.reduce((acc, post) => {
    acc[post.type] = (acc[post.type] || 0) + 1;
    return acc;
  }, {});

  // Post type buttons
  ["article", "essay", "list", "notes", "project", "recipe", "stub"].forEach((type) => {
    const btn = createElement(postTypeOdomoterEl, "button", {
      class: `btn ${globalFilters.types.includes(type) ? "btn-secondary" : "btn-outline-secondary"}`,
      text: titleCase(type),
      onclick: () => toggleFilter("types", type),
    });
    createElement(btn, "span", {
      class: "badge text-bg-primary ms-1",
      text: postCountsByType[type] || 0,
    });
  });
}

// ─── Filters ──────────────────────────────────────────────────────────────
function toggleFilter(kind, filter) {
  const normalized = filter.toLowerCase();

  if (globalFilters[kind].includes(normalized)) {
    globalFilters[kind] = globalFilters[kind].filter((x) => x !== normalized);
  } else {
    globalFilters[kind].push(normalized);
  }

  if (kind === "tags") renderTagCheckboxes();

  const hasFilters = globalFilters.types.length > 0 || globalFilters.tags.length > 0;
  filterViewEl.classList.toggle("d-none", !hasFilters);
  filterHintEl.classList.toggle("d-none", hasFilters);

  activeFiltersListEl.innerText = [...globalFilters.types, ...globalFilters.tags]
    .map(titleCase)
    .join(", ");

  encodeStateToURL();
  renderActiveView();
}

function clearFilters() {
  globalFilters.types = [];
  globalFilters.tags = [];

  renderTagCheckboxes();

  filterViewEl.classList.add("d-none");
  filterHintEl.classList.remove("d-none");

  encodeStateToURL();

  renderActiveView();
}

function copyShareLink() {
  const url = window.location.href;
  if (navigator.clipboard?.writeText) {
    // Fire-and-forget; fall back to execCommand only if the write rejects
    navigator.clipboard.writeText(url).catch(() => {
      const temp = createElement(document.body, "input", { value: url });
      temp.select();
      document.execCommand("copy");
      document.body.removeChild(temp);
    });
  } else {
    const temp = createElement(document.body, "input", { value: url });
    temp.select();
    document.execCommand("copy");
    document.body.removeChild(temp);
  }
  alert("Copied share link for your current post filters!");
}

// ─── Misc UI ──────────────────────────────────────────────────────────────
function scrollToRandomCard() {
  const cards = [...document.querySelectorAll("#card_grid .card")];
  if (cards.length) cards[Math.floor(Math.random() * cards.length)].scrollIntoView();
}

function addScrollSpy() {
  window.onscroll = () => {
    const anchor = document.getElementById("postTypeOdomoter") ?? searchInputEl;
    const visible = anchor && anchor.getBoundingClientRect().bottom > 0;
    scrollToTopBtn.style.display = visible ? "none" : "block";
  };
}

function scrollToTop() {
  const anchor = document.getElementById("postTypeOdomoter") ?? searchInputEl;
  (anchor ?? document.documentElement).scrollIntoView({ behavior: "smooth", block: "start" });
}

function animateSearchPlaceholder() {
  const el = document.getElementById("searchInput");
  const base = "Search the garden";
  let dots = 0;
  setInterval(() => {
    dots = (dots + 1) % 4;
    el.placeholder = base + ".".repeat(dots);
  }, 1000);
}

// ─── Utilities ────────────────────────────────────────────────────────────

/** Escape special regex characters in a string. */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Escape HTML to prevent XSS when setting innerHTML. */
function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Wrap all case-insensitive occurrences of `query` in <mark> tags. */
function highlight(text, query) {
  if (!query) return escapeHtml(text);
  return escapeHtml(text).replace(
    new RegExp(`(${escapeRegex(escapeHtml(query))})`, "gi"),
    "<mark>$1</mark>",
  );
}

/**
 * Return a short excerpt of `content` centred on the first match of
 * `query`, with the match highlighted. `windowWords` controls context size.
 */
function getExcerpt(content, query, windowWords = 30) {
  const lower = content.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx === -1) return null;

  const before = content.slice(0, idx);
  const beforeWords = before.trimStart().split(/\s+/);
  const startWord = Math.max(0, beforeWords.length - windowWords);
  const startOffset =
    startWord === 0 ? 0 : before.length - beforeWords.slice(startWord).join(" ").length;

  const after = content.slice(idx + query.length);
  const afterWords = after.trimEnd().split(/\s+/).slice(0, windowWords).join(" ");

  const raw =
    content.slice(Math.max(0, startOffset), idx) +
    content.slice(idx, idx + query.length) +
    after.slice(0, afterWords.length);

  return highlight(raw.trim(), query);
}

/** Debounce a function by `delay` ms. */
function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/** Capitalise the first letter of each word. */
function titleCase(str) {
  return str
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Create an HTML element, set attributes, append to parent, and return it.
 */
function createElement(parent, tag, attributes = {}) {
  const el = document.createElement(tag);
  Object.entries(attributes).forEach(([attr, value]) => {
    if (attr === "text") el.innerText = value;
    else if (attr === "innerHTML") el.innerHTML = value;
    else if (attr === "textContent") el.textContent = value;
    else if (attr === "onclick") el.onclick = value;
    else if (attr === "onkeydown") el.onkeydown = value;
    else if (attr === "onchange") el.onchange = value;
    else el.setAttribute(attr, value);
  });
  parent.appendChild(el);
  return el;
}
