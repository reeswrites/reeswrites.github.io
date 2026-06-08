// ─── State ────────────────────────────────────────────────────────────────
let globalSearchQuery = "";
let globalSortMode = "relevance"; // "date" | "relevance"

const globalFilters = {
  types: [],
  tags: [],
};

// ─── Element refs ─────────────────────────────────────────────────────────
const cardGridEl = document.getElementById("card_grid");
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

// ─── Tag checkbox dropdown ────────────────────────────────────────────────
function initializeTagSelect() {
  renderTagCheckboxes();

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
      renderGardenPosts();
    }, 250),
  );

  // Handle the native clear (×) button on type="search"
  searchInputEl.addEventListener("search", () => {
    if (searchInputEl.value === "") {
      globalSearchQuery = "";
      updateSortControlsVisibility();
      encodeStateToURL();
      renderGardenPosts();
    }
  });

  // Back/forward navigation
  window.addEventListener("popstate", () => {
    globalSearchQuery = "";
    globalSortMode = "relevance";
    globalFilters.types = [];
    globalFilters.tags = [];
    searchInputEl.value = "";
    renderTagCheckboxes();

    _applySortButtonStyles();
    processURLParams();
    renderGardenPosts();
  });

  processURLParams();
  renderFeaturedPosts();
  renderGardenPosts();
  renderOdometers();
})();

// ─── URL state ────────────────────────────────────────────────────────────

/**
 * Encode all navigable state into URL query params.
 * Order: types → tags → sort → q (always last, to avoid any parsing
 * ambiguity with free-text search content that may contain special chars).
 */
function encodeStateToURL() {
  const params = new URLSearchParams();

  if (globalFilters.types.length > 0) params.set("types", globalFilters.types.join(","));
  if (globalFilters.tags.length > 0) params.set("tags", globalFilters.tags.join(","));

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

  if (sort) {
    globalSortMode = sort;
    _applySortButtonStyles();
  }

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
 * Show sort buttons only when a query is active; hide when search is empty.
 */
function updateSortControlsVisibility() {
  const hasQuery = globalSearchQuery.length > 0;
  sortByDateBtn.classList.toggle("d-none", !hasQuery);
  sortByRelevanceBtn.classList.toggle("d-none", !hasQuery);
}

/**
 * Switch sort mode and re-render.
 */
// oxlint-disable-next-line no-unused-vars
function setSortMode(mode) {
  globalSortMode = mode;
  _applySortButtonStyles();
  encodeStateToURL();
  renderGardenPosts();
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

// ─── Render: garden posts ─────────────────────────────────────────────────
function renderGardenPosts() {
  cardGridEl.innerHTML = "";

  const query = globalSearchQuery;

  const filtered = posts
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
    // TODO can optimize by only scoring posts that match and doing a single sort pass at the end, rather than scoring every post on every render
    .sort((a, b) => {
      if (globalSortMode === "relevance" && query) {
        const diff = scorePost(b, query) - scorePost(a, query);
        return diff !== 0 ? diff : b.date - a.date;
      }
      return b.date - a.date;
    });

  filtered.forEach((post) => renderPostCard(cardGridEl, post, null, true, true, query));

  if (filtered.length === 0) {
    createElement(cardGridEl, "p", {
      class: "text-muted mt-2",
      text: query
        ? `No posts matched "${query}" with the current filters.`
        : "No posts match the current filters.",
    });
  }

  new Masonry(cardGridEl, { itemSelector: ".col", percentPosition: true });
  renderOdometers();
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

// ─── Render: odometer filter buttons ─────────────────────────────────────
function renderOdometers() {
  postTypeOdomoterEl.innerHTML = "";

  // Single filtered base respecting all active state: types, tags, and search
  const filteredBase = posts
    .filter((post) => globalFilters.types.length === 0 || globalFilters.types.includes(post.type))
    .filter(
      (post) =>
        globalFilters.tags.length === 0 ||
        post.tags.map((x) => x.toLowerCase()).some((tag) => globalFilters.tags.includes(tag)),
    )
    .filter((post) => {
      if (!globalSearchQuery) return true;
      return (
        post.title.toLowerCase().includes(globalSearchQuery) ||
        post.description.toLowerCase().includes(globalSearchQuery) ||
        post.tags.some((t) => t.toLowerCase().includes(globalSearchQuery)) ||
        post.content.toLowerCase().includes(globalSearchQuery)
      );
    });

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
  renderGardenPosts();
}

function clearFilters() {
  globalFilters.types = [];
  globalFilters.tags = [];

  renderTagCheckboxes();

  filterViewEl.classList.add("d-none");
  filterHintEl.classList.remove("d-none");

  encodeStateToURL();

  renderGardenPosts();
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
    const past20 = document.body.scrollTop > 20 || document.documentElement.scrollTop > 20;
    scrollToTopBtn.style.display = past20 ? "block" : "none";
  };
}

function scrollToTop() {
  document.body.scrollTop = 0;
  document.documentElement.scrollTop = 0;
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
