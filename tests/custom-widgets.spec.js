// @ts-check

/**
 * Smoke tests — custom widget builder wired on every data + inventory page.
 *
 * Strategy
 * ─────────
 * For each page we:
 *   1. Load the page (injecting the scrobbles fixture for /data/listening where
 *      async fetch is required).
 *   2. Clear localStorage so no stale widget layout interferes.
 *   3. Click the "Create widget" button.
 *   4. Select "Stat card" (requires no dimension; works for all pages).
 *   5. Save and assert a .card appears in the custom grid.
 *
 * A "Stat card" is intentionally used instead of a leaderboard/donut because
 * it renders without roughViz (no SVG / offsetWidth timing issues) and works
 * even when the dataset is empty or dimension-less (e.g. steps, swimming).
 *
 * Additionally validates the InsightsEngine array-dimension extension (added
 * for multi-value fields like genres, mechanism, origin_country).
 */

const { test, expect } = require("@playwright/test");
const SCROBBLES_FIXTURE = require("./fixtures/scrobbles-data.json");
const { injectFixture: injectScrobbles } = require("./helpers/listening");

// ── Page manifest ─────────────────────────────────────────────────────────────

/**
 * @type {Array<{
 *   path: string,
 *   prefix: string,
 *   needsScrobbles?: boolean,
 *   waitForEl?: string,
 * }>}
 */
const PAGES = [
  // ── Tier 1: data pages ────────────────────────────────────────────────────
  { path: "/data/beer.html", prefix: "beer-" },
  { path: "/data/movies.html", prefix: "movie-" },
  { path: "/data/books-read.html", prefix: "booksread-" },
  { path: "/data/tv.html", prefix: "tv-" },
  { path: "/data/cardio.html", prefix: "cardio-" },
  { path: "/data/steps.html", prefix: "steps-" },
  // ── Tier 1: inventory pages ───────────────────────────────────────────────
  { path: "/inventory/board-games.html", prefix: "games-" },
  { path: "/inventory/books-owned.html", prefix: "books-" },
  { path: "/inventory/dvds.html", prefix: "dvds-" },
  { path: "/inventory/fragrance.html", prefix: "frag-" },
  { path: "/inventory/records.html", prefix: "records-" },
  // ── Tier 2: data adapters ─────────────────────────────────────────────────
  { path: "/data/lifting.html", prefix: "lifting-" },
  {
    path: "/data/listening.html",
    prefix: "music-",
    needsScrobbles: true,
    // Wait for the async InsightsDashboard to finish loading (and therefore
    // for our fetchData().then(InsightsBuilder.init) to have also run).
    waitForEl: "#insights-content",
  },
  // ── Tier 3: from-scratch page ─────────────────────────────────────────────
  { path: "/data/swimming-times.html", prefix: "swim-" },
];

// ── Smoke test loop ───────────────────────────────────────────────────────────

for (const { path, prefix, needsScrobbles, waitForEl } of PAGES) {
  test(`widget builder smoke: ${path}`, async ({ page }) => {
    if (needsScrobbles) {
      await injectScrobbles(page, SCROBBLES_FIXTURE);
    }

    // Wipe localStorage before load so no old layout interferes
    await page.addInitScript(() => localStorage.clear());

    await page.goto(path);

    if (waitForEl) {
      // Async page — wait for the element that signals data + init are complete
      await expect(page.locator(waitForEl)).toBeVisible({ timeout: 15_000 });
    } else {
      // Synchronous pages — scripts have already run at networkidle
      await page.waitForLoadState("networkidle");
    }

    // ── Open create modal ─────────────────────────────────────────────────────
    const createBtn = page.locator(`#${prefix}custom-create`);
    await expect(createBtn).toBeVisible({ timeout: 10_000 });
    await createBtn.click();

    const builder = page.locator(`#${prefix}custom-builder`);
    await expect(builder).toBeVisible({ timeout: 5_000 });

    // ── Select "Stat card" type — works on every page ─────────────────────────
    await page.locator(`#${prefix}custom-type-picker button`, { hasText: "Stat card" }).click();

    // ── Save ──────────────────────────────────────────────────────────────────
    await page.click(`#${prefix}custom-save`);
    await expect(builder).not.toBeVisible({ timeout: 3_000 });

    // ── Card rendered in grid ─────────────────────────────────────────────────
    await expect(page.locator(`#${prefix}custom-grid .card`)).toBeVisible({
      timeout: 5_000,
    });
  });
}

// ── InsightsEngine array-dimension extension tests ────────────────────────────

test("engine groupBy counts row under each element of an array-valued field", async ({ page }) => {
  // Load any page that has InsightsEngine — beer is simplest
  await page.goto("/data/beer.html");
  await page.waitForLoadState("networkidle");

  const result = await page.evaluate(() => {
    const rows = [
      { g: ["a", "b"] }, // contributes to both "a" and "b"
      { g: ["a"] }, // contributes to "a" only
      { g: ["b", "c"] }, // contributes to "b" and "c"
    ];
    const agg = InsightsEngine.aggregate(rows, { groupBy: "g" });
    // groups[].value = metric("count") = gRows.length for that bucket
    return Object.fromEntries(agg.groups.map(({ label, value }) => [label, value]));
  });

  expect(result["a"]).toBe(2); // rows 0 + 1
  expect(result["b"]).toBe(2); // rows 0 + 2
  expect(result["c"]).toBe(1); // row 2 only
});

test("engine 'in' filter matches rows where array field intersects the filter value", async ({
  page,
}) => {
  await page.goto("/data/beer.html");
  await page.waitForLoadState("networkidle");

  const result = await page.evaluate(() => {
    const rows = [
      { tags: ["action", "comedy"] }, // passes  (has "action")
      { tags: ["action"] }, // passes  (has "action")
      { tags: ["comedy", "drama"] }, // no pass (no "action")
      { tags: ["drama"] }, // no pass (no "action")
    ];
    // The "in" op expects value to be an array; intersection match for array fields.
    const agg = InsightsEngine.aggregate(rows, {
      filter: [{ field: "tags", op: "in", value: ["action"] }],
      groupBy: "tags",
    });
    return agg.groups.map((g) => g.label);
  });

  expect(result).toContain("action");
  expect(result).toContain("comedy"); // from row 0 which passed the filter
  expect(result).not.toContain("drama"); // only in rows that didn't pass
});
