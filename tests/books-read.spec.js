// @ts-check

/**
 * E2E tests for the /data/books-read page.
 *
 * ── Coverage ──────────────────────────────────────────────────────────────────
 *  1. Tab structure: Insights (default), Table
 *  2. Insights stats computed from fixture data
 *  3. Extra charts render as SVG
 *  4. Entity toggle (Authors / Decades)
 *  5. Table tab shows correct column headers
 *  6. Genre filter bar
 *  7. Detail modal
 *
 * ── Fixture summary (books-read-data.json) ───────────────────────────────────
 *  5 books: 3 by Author Alpha (ratings 5,4,3), 1 Author Beta (5), 1 Author Gamma (2)
 *  totalBooks=5, totalPages=1310, avgPages=262, avgRating=3.80
 *  topAuthor = "Author Alpha (3)"
 *  decades (key-desc sort): 2010s(1), 2000s(2), 1990s(1), 1980s(1)
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

test("tabs appear in order: Insights, Table", async ({ page }) => {
  const tabs = page.locator("#myTab .nav-link");
  await expect(tabs).toHaveCount(2);
  await expect(tabs.nth(0)).toHaveAttribute("id", "insights-tab");
  await expect(tabs.nth(1)).toHaveAttribute("id", "table-tab");
});

// ── 2. Insights stats ─────────────────────────────────────────────────────────

test("shows correct book count from fixture", async ({ page }) => {
  await expect(page.locator("#booksread-stat-total")).toHaveText("5");
});

test("shows correct total pages from fixture", async ({ page }) => {
  await expect(page.locator("#booksread-stat-pages")).toHaveText("1,310");
});

test("shows correct average pages per book from fixture", async ({ page }) => {
  await expect(page.locator("#booksread-stat-avgpages")).toHaveText("262");
});

test("shows correct average rating from fixture", async ({ page }) => {
  // Check only the numeric part to avoid non-ASCII star character encoding issues
  await expect(page.locator("#booksread-stat-rating")).toContainText("3.80");
});

test("shows correct top author from fixture", async ({ page }) => {
  await expect(page.locator("#booksread-stat-topauthor")).toHaveText("Author Alpha (3)");
});

// ── 3. Extra charts ───────────────────────────────────────────────────────────

test("rating distribution chart renders an SVG", async ({ page }) => {
  await expect(page.locator("#booksread-rating-chart svg")).toBeVisible({ timeout: 10_000 });
});

test("page-length chart renders an SVG", async ({ page }) => {
  await expect(page.locator("#booksread-pagelength-chart svg")).toBeVisible({ timeout: 10_000 });
});

// ── 4. Entity toggle ──────────────────────────────────────────────────────────

test("authors entity is active by default with correct top entry", async ({ page }) => {
  await expect(page.locator("[data-entity='authors']")).toHaveClass(/btn-secondary/);
  await expect(page.locator("#booksread-top-list .fw-semibold").first()).toHaveText("Author Alpha");
});

test("decades entity shows fixture publication decades", async ({ page }) => {
  await page.locator("[data-entity='decades']").click();

  // Fixture decades: 1990s(1), 2000s(2 — years 2000+2005), 2010s(1), 1980s(1)
  // Sorted by key desc: 2010s is first
  await expect(page.locator("#booksread-top-list .fw-semibold").first()).toHaveText("2010s");
  await expect(page.locator("[data-entity='decades']")).toHaveClass(/btn-secondary/);
});

test("switching between entity tabs updates the active button", async ({ page }) => {
  await page.locator("[data-entity='decades']").click();
  await expect(page.locator("[data-entity='decades']")).toHaveClass(/btn-secondary/);
  await expect(page.locator("[data-entity='authors']")).toHaveClass(/btn-outline-secondary/);

  await page.locator("[data-entity='authors']").click();
  await expect(page.locator("[data-entity='authors']")).toHaveClass(/btn-secondary/);
  await expect(page.locator("[data-entity='decades']")).toHaveClass(/btn-outline-secondary/);
});

// ── 5. Table tab ──────────────────────────────────────────────────────────────

test("table tab shows correct column headers", async ({ page }) => {
  await page.locator("#table-tab").click();
  await expect(page.locator("#table-tab-pane")).toBeVisible();

  const headers = page.locator("#myTable thead td");
  await expect(headers.nth(1)).toContainText("Title");
  await expect(headers.nth(2)).toContainText("Author");
  await expect(headers.nth(3)).toContainText("Rating");
});

test("table tab has at least one data row from the real data", async ({ page }) => {
  await page.locator("#table-tab").click();
  await expect(page.locator("#myTable tbody tr").first()).toBeVisible({ timeout: 8_000 });
});

// ── 6. Genre filter bar ───────────────────────────────────────────────────────

test("genre and star filter bar is present in table tab", async ({ page }) => {
  await page.locator("#table-tab").click();
  await expect(page.locator("#data-filter-bar")).toBeVisible();
  await expect(page.locator("#filter-genre-btn")).toBeVisible();
  await expect(page.locator("#filter-star-slider")).toBeVisible();
});

test("books genre dropdown is populated with options from table data", async ({ page }) => {
  await page.locator("#table-tab").click();
  await page.locator("#filter-genre-btn").click();
  const items = page.locator("#filter-genre-menu li");
  expect(await items.count()).toBeGreaterThanOrEqual(1);
});

test("selecting a books genre filters the DataTable", async ({ page }) => {
  await page.locator("#table-tab").click();
  await page.locator("#filter-genre-btn").click();
  await page.locator("#filter-genre-menu input[type='checkbox']").first().check();
  await expect(page.locator("#myTable_info")).toContainText("filtered from", { timeout: 5_000 });
});

// ── 7. Detail modal ───────────────────────────────────────────────────────────

test("books table rows have info buttons with data-modal-id", async ({ page }) => {
  await page.locator("#table-tab").click();
  await expect(page.locator("#myTable tbody [data-modal-id]").first()).toBeVisible({
    timeout: 5_000,
  });
});

test("clicking a book info button opens the detail modal", async ({ page }) => {
  await page.locator("#table-tab").click();
  await page.locator("#myTable tbody [data-modal-id]").first().click();
  await expect(page.locator("#dataModal")).toBeVisible({ timeout: 5_000 });
});

test("book modal title is non-empty after opening", async ({ page }) => {
  await page.locator("#table-tab").click();
  await page.locator("#myTable tbody [data-modal-id]").first().click();
  await expect(page.locator("#dataModalLabel")).not.toBeEmpty({ timeout: 5_000 });
});

test("opening book modal sets ?item= in the URL", async ({ page }) => {
  await page.locator("#table-tab").click();
  await page.locator("#myTable tbody [data-modal-id]").first().click();
  await expect(page.locator("#dataModal")).toBeVisible({ timeout: 5_000 });
  await expect(page).toHaveURL(/[?&]item=/);
});

test("closing book modal clears ?item= from the URL", async ({ page }) => {
  await page.locator("#table-tab").click();
  await page.locator("#myTable tbody [data-modal-id]").first().click();
  await expect(page.locator("#dataModal")).toBeVisible({ timeout: 5_000 });
  await page.locator("#dataModal .btn-close").click();
  await expect(page.locator("#dataModal")).not.toBeVisible({ timeout: 5_000 });
  await expect(page).not.toHaveURL(/[?&]item=/, { timeout: 3_000 });
});
