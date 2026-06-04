// @ts-check

/**
 * E2E tests for the /data/books-read page.
 *
 * ── Coverage ──────────────────────────────────────────────────────────────────
 *  1. Tab structure: Insights (default), Calendar, Table
 *  2. Insights stats computed from fixture data
 *  3. Charts render as SVG
 *  4. Leaderboard toggle (Authors / Decades)
 *  5. Calendar lazy-renders when its tab is clicked
 *  6. Table tab shows correct column headers
 *
 * ── Fixture summary (books-read-data.json) ───────────────────────────────────
 *  5 books: 3 by Author Alpha (ratings 5,4,3), 1 Author Beta (5), 1 Author Gamma (2)
 *  totalBooks=5, totalPages=1310, avgPages=262, avgRating=3.80
 *  topAuthor = "Author Alpha (3 books)"
 */

const { test, expect } = require("@playwright/test");
const FIXTURE = require("./fixtures/books-read-data.json");
const { injectFixture, gotoBooksRead, waitForInsights } = require("./helpers/books-read");

// ── Shared setup ──────────────────────────────────────────────────────────────

test.beforeEach(async ({ page }) => {
  await injectFixture(page, FIXTURE);
  await gotoBooksRead(page);
  await waitForInsights(page);
});

// ── 1. Tab structure ──────────────────────────────────────────────────────────

test("insights tab is active by default", async ({ page }) => {
  await expect(page.locator("#insights-tab")).toHaveClass(/active/);
  await expect(page.locator("#insights-tab-pane")).toHaveClass(/show active/);
});

test("tabs appear in order: Insights, Calendar, Table", async ({ page }) => {
  const tabs = page.locator("#myTab .nav-link");
  await expect(tabs).toHaveCount(3);
  await expect(tabs.nth(0)).toHaveAttribute("id", "insights-tab");
  await expect(tabs.nth(1)).toHaveAttribute("id", "calendar-tab");
  await expect(tabs.nth(2)).toHaveAttribute("id", "table-tab");
});

// ── 2. Insights stats ─────────────────────────────────────────────────────────

test("shows correct book count from fixture", async ({ page }) => {
  await expect(page.locator("#stat-total-books")).toHaveText("5");
});

test("shows correct total pages from fixture", async ({ page }) => {
  await expect(page.locator("#stat-total-pages")).toHaveText("1,310");
});

test("shows correct average pages per book from fixture", async ({ page }) => {
  await expect(page.locator("#stat-avg-pages")).toHaveText("262");
});

test("shows correct average rating from fixture", async ({ page }) => {
  // Check only the numeric part to avoid non-ASCII character encoding issues in the test env
  await expect(page.locator("#stat-my-rating")).toContainText("3.80");
});

test("shows correct top author from fixture", async ({ page }) => {
  await expect(page.locator("#stat-top-author")).toHaveText("Author Alpha (3 books)");
});

// ── 3. Charts ─────────────────────────────────────────────────────────────────

test("rating distribution chart renders an SVG", async ({ page }) => {
  await expect(page.locator("#books-rating-chart svg")).toBeVisible({ timeout: 10_000 });
});

test("page-length chart renders an SVG", async ({ page }) => {
  await expect(page.locator("#books-pages-chart svg")).toBeVisible({ timeout: 10_000 });
});

// ── 4. Leaderboard toggle ─────────────────────────────────────────────────────

test("authors leaderboard is active by default with correct top entry", async ({ page }) => {
  await expect(page.locator("[data-lb='authors']")).toHaveClass(/btn-secondary/);
  await expect(page.locator("#books-lb-list .fw-semibold").first()).toHaveText("Author Alpha");
});

test("decades leaderboard shows fixture publication decades", async ({ page }) => {
  await page.locator("[data-lb='decades']").click();

  // Fixture years: 1990, 2000, 2010, 1980, 2005
  // decadeCounts: {1990s:1, 2000s:2 (y=2000+y=2005), 2010s:1, 1980s:1}
  // First item ranked by count desc: 2000s (count=2) wins
  await expect(page.locator("#books-lb-list .fw-semibold").first()).toHaveText("2000s");
  await expect(page.locator("[data-lb='decades']")).toHaveClass(/btn-secondary/);
});

test("switching between leaderboard tabs updates the active button", async ({ page }) => {
  await page.locator("[data-lb='decades']").click();
  await expect(page.locator("[data-lb='decades']")).toHaveClass(/btn-secondary/);
  await expect(page.locator("[data-lb='authors']")).toHaveClass(/btn-outline-secondary/);

  await page.locator("[data-lb='authors']").click();
  await expect(page.locator("[data-lb='authors']")).toHaveClass(/btn-secondary/);
  await expect(page.locator("[data-lb='decades']")).toHaveClass(/btn-outline-secondary/);
});

// ── 5. Calendar lazy-render ───────────────────────────────────────────────────

test("calendar is not rendered until its tab is clicked", async ({ page }) => {
  await expect(page.locator(".fc")).toHaveCount(0);
});

test("clicking calendar tab renders FullCalendar", async ({ page }) => {
  await page.locator("#calendar-tab").click();
  await expect(page.locator(".fc")).toBeVisible({ timeout: 10_000 });
});

// ── 6. Table tab ──────────────────────────────────────────────────────────────

test("table tab shows correct column headers", async ({ page }) => {
  await page.locator("#table-tab").click();
  await expect(page.locator("#table-tab-pane")).toBeVisible();

  const headers = page.locator("#myTable thead td");
  await expect(headers.nth(0)).toContainText("Title");
  await expect(headers.nth(1)).toContainText("Author");
  await expect(headers.nth(4)).toContainText("Rating");
});

test("table tab has at least one data row from the real data", async ({ page }) => {
  await page.locator("#table-tab").click();
  // The table body is rendered from Liquid (real data), not the fixture.
  await expect(page.locator("#myTable tbody tr").first()).toBeVisible({ timeout: 8_000 });
});
