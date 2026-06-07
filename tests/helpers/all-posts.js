// @ts-check
// no Playwright imports needed — all helpers are plain async functions

/**
 * Frozen "today" used by the test suite: May 15, 2026.
 *
 * The fixture post "Travel Reflections" is dated 2024-05-15 (same month+day),
 * so it will always appear in the "On This Day" featured section.
 *
 * Evaluated in Node context so timezone semantics match the page context.
 */
const FROZEN_DATE_MS = new Date(2026, 4, 15, 0, 0, 0, 0).getTime();

/**
 * Inject the frozen fixture into the page BEFORE any page scripts run.
 *
 * Locks window.POSTS_DATA as non-writable so Jekyll's inline Liquid assignment
 * (`window.POSTS_DATA = [...]`) silently no-ops.
 *
 * Freezes `Date` to FROZEN_DATE_MS so:
 *   - `new Date()` returns May 15 2026 → the "On This Day" feature is deterministic.
 *   - `Date.now()` returns FROZEN_DATE_MS → timeago relative times are deterministic.
 *   - `new Date(y, m, d, ...)` (multi-arg form) still uses the real constructor
 *     → post-date parsing in all-posts.js is unaffected.
 *
 * Call this before page.goto().
 *
 * @param {import('@playwright/test').Page} page
 * @param {object[]} fixture  - The POSTS_DATA fixture array
 */
async function injectFixture(page, fixture) {
  await page.addInitScript(
    ({ data, frozenMs }) => {
      // ── Lock POSTS_DATA ──────────────────────────────────────────────────────
      Object.defineProperty(window, "POSTS_DATA", {
        value: data,
        writable: false,
        configurable: false,
      });

      // ── Freeze Date ──────────────────────────────────────────────────────────
      const _Date = Date;

      /**
       * FrozenDate constructor: behaves exactly like the real Date, except that
       * the no-argument form always returns the frozen instant instead of "now".
       *
       * When used as a constructor, returning an object from the function body
       * causes that object to become the result of `new FrozenDate(...)`.
       *
       * @param {...any} args
       * @returns {Date}
       */
      function FrozenDate(...args) {
        return args.length === 0 ? new _Date(frozenMs) : new _Date(...args);
      }

      // Make `instanceof Date` still work for real Date objects
      FrozenDate.prototype = _Date.prototype;

      // Static methods
      FrozenDate.now = () => frozenMs;
      FrozenDate.parse = _Date.parse.bind(_Date);
      FrozenDate.UTC = _Date.UTC.bind(_Date);

      // So FrozenDate itself passes `instanceof Function` checks and looks like Date
      Object.setPrototypeOf(FrozenDate, _Date);

      window.Date = FrozenDate;
    },
    { data: fixture, frozenMs: FROZEN_DATE_MS },
  );
}

/**
 * Navigate to /posts/all/ and wait until the card grid is populated.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} [search=""] Optional URL search string, e.g. "?types=article"
 */
async function gotoAllPosts(page, search = "") {
  await page.goto(`/posts/all/${search}`);
}

/**
 * Wait until the card grid has rendered at least one card (or a no-results
 * paragraph), confirming that renderGardenPosts() has completed.
 *
 * @param {import('@playwright/test').Page} page
 */
async function waitReady(page) {
  await page.waitForSelector("#card_grid .card, #card_grid p", {
    timeout: 10_000,
  });
  // Wait for the tag filter dropdown button to be present
  await page.waitForSelector("#tagFilterBtn", { timeout: 5_000 });
}

/**
 * Return the text content of every post title link inside #card_grid,
 * in DOM order (which matches the current sort).
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string[]>}
 */
async function cardTitles(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll("#card_grid .card .card-body a")].map(
      (a) => a.textContent?.trim() ?? "",
    ),
  );
}

/**
 * Select a tag in the checkbox dropdown by its value.
 * Opens the dropdown, checks the matching checkbox, and waits for the DOM to update.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} value  - The lower-cased tag value (e.g. "music")
 */
async function selectTag(page, value) {
  await page.locator("#tagFilterBtn").click();
  await page.locator(`#tagFilterMenu input[type="checkbox"][value="${value}"]`).check();
  await page.waitForTimeout(150);
}

/**
 * Deselect a tag in the checkbox dropdown by its value.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} value  - The lower-cased tag value to remove
 */
async function removeTag(page, value) {
  await page.locator("#tagFilterBtn").click();
  await page.locator(`#tagFilterMenu input[type="checkbox"][value="${value}"]`).uncheck();
  await page.waitForTimeout(150);
}

/**
 * Return the text inside #activeFilters (the comma-separated active-filter label).
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string>}
 */
async function activeFilterText(page) {
  return page.locator("#activeFilters").innerText();
}

/**
 * Return the current URL search params as a plain object.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Record<string, string>>}
 */
async function urlParams(page) {
  const url = new URL(page.url());
  return Object.fromEntries(url.searchParams.entries());
}

/**
 * Click a type button in the post-type odometer by its display label (e.g. "Article").
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} label  - Title-cased type label, e.g. "Article", "Notes"
 */
async function clickTypeButton(page, label) {
  // The button's text node is the type label; the badge is a child span.
  // Filter by text that starts with the label (to avoid matching the badge text).
  await page
    .locator("#postTypeOdomoter button")
    .filter({ hasText: new RegExp(`^${label}`) })
    .click();
  await page.waitForTimeout(150);
}

module.exports = {
  FROZEN_DATE_MS,
  injectFixture,
  gotoAllPosts,
  waitReady,
  cardTitles,
  selectTag,
  removeTag,
  activeFilterText,
  urlParams,
  clickTypeButton,
};
