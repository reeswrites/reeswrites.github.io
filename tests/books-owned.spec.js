// @ts-check

/**
 * E2E tests for the /data/books-owned page.
 *
 * ── Coverage ──────────────────────────────────────────────────────────────────
 *  1. Tab structure: Insights (default), Table
 *  2. Insights stats computed from fixture data (dateless dashboard)
 *  3. Entity toggle: Authors, Genres, Decades
 *  4. Table tab column headers
 *
 * ── Fixture summary (books-owned-data.json) ──────────────────────────────────
 *  5 books: 2 by Author Alpha, 1 each for Beta/Gamma/Delta
 *  total=5, totalPages=1500, uniqueAuthors=4, avgRating=4.24
 *  topAuthor="Author Alpha (2)", topGenre="Fiction", oldest=1970, newest=2010
 */

const { test, expect } = require("@playwright/test");
const FIXTURE = require("./fixtures/books-owned-data.json");
const { injectFixture, gotoBooksOwned, waitForInsights } = require("./helpers/books-owned");

// ── Shared setup ──────────────────────────────────────────────────────────────

test.beforeEach(async ({ page }) => {
  await injectFixture(page, FIXTURE);
  await gotoBooksOwned(page);
  await waitForInsights(page);
});

// ── 1. Tab structure ──────────────────────────────────────────────────────────

test("insights tab is active by default", async ({ page }) => {
  await expect(page.locator("#insights-tab")).toHaveClass(/active/);
  await expect(page.locator("#insights-tab-pane")).toHaveClass(/show active/);
});

test("tabs appear in order: Insights, Table", async ({ page }) => {
  const tabs = page.locator("#myTab .nav-link");
  await expect(tabs).toHaveCount(2);
  await expect(tabs.nth(0)).toHaveAttribute("id", "insights-tab");
  await expect(tabs.nth(1)).toHaveAttribute("id", "table-tab");
});

// ── 2. Insights stats (dateless) ──────────────────────────────────────────────

test("shows correct total book count from fixture", async ({ page }) => {
  await expect(page.locator("#books-stat-total")).toHaveText("5");
});

test("shows correct total pages from fixture", async ({ page }) => {
  await expect(page.locator("#books-stat-pages")).toHaveText("1,500");
});

test("shows correct unique author count from fixture", async ({ page }) => {
  await expect(page.locator("#books-stat-authors")).toHaveText("4");
});

test("shows correct average community rating from fixture", async ({ page }) => {
  await expect(page.locator("#books-stat-rating")).toHaveText("4.24");
});

test("shows correct top author from fixture", async ({ page }) => {
  await expect(page.locator("#books-stat-topauth")).toHaveText("Author Alpha (2)");
});

test("shows correct top genre from fixture", async ({ page }) => {
  await expect(page.locator("#books-stat-topgen")).toHaveText("Fiction");
});

test("shows correct oldest and newest publication year from fixture", async ({ page }) => {
  await expect(page.locator("#books-stat-oldest")).toHaveText("1970");
  await expect(page.locator("#books-stat-newest")).toHaveText("2010");
});

// ── 3. Entity toggle ──────────────────────────────────────────────────────────

test("authors entity is active by default and shows correct top entry", async ({ page }) => {
  await expect(page.locator("[data-entity='authors']")).toHaveClass(/btn-secondary/);
  await expect(page.locator("#books-top-list .fw-semibold").first()).toHaveText("Author Alpha");
});

test("genres entity toggle shows Fiction as top genre", async ({ page }) => {
  await page.locator("[data-entity='genres']").click();

  // Fixture: Fiction(3), Non-Fiction(1), Sci-Fi(1)
  await expect(page.locator("#books-top-list .fw-semibold").first()).toHaveText("Fiction");
  await expect(page.locator("[data-entity='genres']")).toHaveClass(/btn-secondary/);
});

test("decades entity toggle shows books sorted by decade (newest first)", async ({ page }) => {
  await page.locator("[data-entity='decades']").click();

  // Fixture years: 1990, 2000, 1980, 2010, 1970 → decades sorted by year desc: 2010s, 2000s, 1990s, 1980s, 1970s
  await expect(page.locator("#books-top-list .fw-semibold").first()).toHaveText("2010s");
  await expect(page.locator("[data-entity='decades']")).toHaveClass(/btn-secondary/);
});

// ── 4. Table tab ──────────────────────────────────────────────────────────────

test("table tab shows correct column headers", async ({ page }) => {
  await page.locator("#table-tab").click();
  await expect(page.locator("#table-tab-pane")).toBeVisible();

  const headers = page.locator("#myTable thead td");
  await expect(headers.nth(0)).toContainText("Title");
  await expect(headers.nth(1)).toContainText("Author");
});
