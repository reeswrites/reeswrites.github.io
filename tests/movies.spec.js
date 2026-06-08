// @ts-check

/**
 * E2E tests for the /data/movies page.
 *
 * ── Coverage ──────────────────────────────────────────────────────────────────
 *  1. Insights tab is the default active tab
 *  2. Recently-watched section shows movie cards
 *  3. Per-year and rating-distribution charts render
 *  4. Watch-history heatmap renders above the tabs
 *  5. Table rating column carries text-nowrap so emojis don't wrap
 *  6. Tab ordering: Insights, Table
 */

const { test, expect } = require("@playwright/test");

async function gotoMovies(page) {
  await page.goto("/data/movies.html");
}

// ── 1. Page load & default tab ────────────────────────────────────────────────

test("insights tab is active by default", async ({ page }) => {
  await gotoMovies(page);
  await expect(page.locator("#insights-tab")).toHaveClass(/active/);
  await expect(page.locator("#insights-tab-pane")).toHaveClass(/show/);
  await expect(page.locator("#insights-tab-pane")).toHaveClass(/active/);
});

test("other tabs are not active on load", async ({ page }) => {
  await gotoMovies(page);
  await expect(page.locator("#table-tab")).not.toHaveClass(/active/);
});

// ── 2. Tab ordering ───────────────────────────────────────────────────────────

test("tabs appear in order: Insights, Table", async ({ page }) => {
  await gotoMovies(page);
  const tabs = page.locator("#myTab .nav-link");
  await expect(tabs).toHaveCount(2);
  await expect(tabs.nth(0)).toHaveAttribute("id", "insights-tab");
  await expect(tabs.nth(1)).toHaveAttribute("id", "table-tab");
});

// ── 3. Insights — recently watched ───────────────────────────────────────────

test("insights tab shows recently-watched movie list", async ({ page }) => {
  await gotoMovies(page);
  // Movies recently-watched is a <ul id="recent-list"> above the tab panes.
  // Items start hidden (d-none); click "Load 5 more" to reveal them.
  await page.locator("#load-more-btn").click();
  const items = page.locator("#recent-list .recent-item:not(.d-none)");
  await expect(items.first()).toBeVisible({ timeout: 8_000 });
  const count = await items.count();
  expect(count).toBeGreaterThan(0);
});

test("first recently-watched movie is the most recent and shows year", async ({ page }) => {
  await gotoMovies(page);
  // Load items so they're visible, then check the first one contains a year.
  await page.locator("#load-more-btn").click();
  const firstItem = page.locator("#recent-list .recent-item:not(.d-none)").first();
  await expect(firstItem).toBeVisible({ timeout: 8_000 });
  await expect(firstItem).toContainText("2026");
});

// ── 4. Insights — charts ──────────────────────────────────────────────────────

test("per-year chart renders an SVG", async ({ page }) => {
  await gotoMovies(page);
  await expect(page.locator("#movie-timeline-chart svg")).toBeVisible({ timeout: 10_000 });
});

test("rating distribution chart renders an SVG", async ({ page }) => {
  await gotoMovies(page);
  await expect(page.locator("#movie-rating-chart svg")).toBeVisible({ timeout: 10_000 });
});

// ── 5. Heatmap ────────────────────────────────────────────────────────────────

test("watch history heatmap renders above the tabs", async ({ page }) => {
  await gotoMovies(page);
  await expect(page.locator("#movie-heatmap")).toBeVisible({ timeout: 8_000 });
  await expect(page.locator("#movie-heatmap .heatmap-day")).not.toHaveCount(0);
});

// ── 6. Table — rating column doesn't wrap ─────────────────────────────────────

test("table rating cells have text-nowrap class", async ({ page }) => {
  await gotoMovies(page);
  await page.locator("#table-tab").click();
  await expect(page.locator("#myTable tbody tr:first-child td:nth-child(5)")).toHaveClass(
    /text-nowrap/,
    { timeout: 8_000 },
  );
});

test("table shows correct column headers", async ({ page }) => {
  await gotoMovies(page);
  await page.locator("#table-tab").click();
  const headers = page.locator("#myTable thead td");
  await expect(headers.nth(1)).toContainText("Name");
  await expect(headers.nth(4)).toContainText("Rating");
  await expect(headers.nth(5)).toContainText("Watch Date");
});

// ── 7. Genre filter bar ───────────────────────────────────────────────────────
// Filter bar reads data-genre and data-rating from Liquid-rendered rows.

test("genre and star filter bar is present in table tab", async ({ page }) => {
  await gotoMovies(page);
  await page.locator("#table-tab").click();
  await expect(page.locator("#data-filter-bar")).toBeVisible();
  await expect(page.locator("#filter-genre")).toBeVisible();
  await expect(page.locator("#filter-star-slider")).toBeVisible();
});

test("movies genre select is populated with options from table data", async ({ page }) => {
  await gotoMovies(page);
  await page.locator("#table-tab").click();
  const count = await page.locator("#filter-genre option").count();
  expect(count).toBeGreaterThanOrEqual(2);
  await expect(page.locator("#filter-genre option").first()).toContainText("All");
});

test("selecting a movie genre filters the DataTable", async ({ page }) => {
  await gotoMovies(page);
  await page.locator("#table-tab").click();
  const firstGenre = page.locator("#filter-genre option").nth(1);
  const genreValue = await firstGenre.getAttribute("value");
  await page.locator("#filter-genre").selectOption(genreValue ?? "");
  await expect(page.locator("#myTable_info")).toContainText("filtered from", { timeout: 5_000 });
});

// ── 8. Detail modal ───────────────────────────────────────────────────────────

test("movies table rows have info buttons with data-modal-id", async ({ page }) => {
  await gotoMovies(page);
  await page.locator("#table-tab").click();
  await expect(page.locator("#myTable tbody [data-modal-id]").first()).toBeVisible({
    timeout: 5_000,
  });
});

test("clicking a movie info button opens the detail modal", async ({ page }) => {
  await gotoMovies(page);
  await page.locator("#table-tab").click();
  await page.locator("#myTable tbody [data-modal-id]").first().click();
  await expect(page.locator("#dataModal")).toBeVisible({ timeout: 5_000 });
});

test("movie modal title is non-empty after opening", async ({ page }) => {
  await gotoMovies(page);
  await page.locator("#table-tab").click();
  await page.locator("#myTable tbody [data-modal-id]").first().click();
  await expect(page.locator("#dataModalLabel")).not.toBeEmpty({ timeout: 5_000 });
});

test("opening movie modal sets ?item= in the URL", async ({ page }) => {
  await gotoMovies(page);
  await page.locator("#table-tab").click();
  await page.locator("#myTable tbody [data-modal-id]").first().click();
  await expect(page.locator("#dataModal")).toBeVisible({ timeout: 5_000 });
  await expect(page).toHaveURL(/[?&]item=/);
});

test("closing movie modal clears ?item= from the URL", async ({ page }) => {
  await gotoMovies(page);
  await page.locator("#table-tab").click();
  await page.locator("#myTable tbody [data-modal-id]").first().click();
  await expect(page.locator("#dataModal")).toBeVisible({ timeout: 5_000 });
  await page.locator("#dataModal .btn-close").click();
  await expect(page.locator("#dataModal")).not.toBeVisible({ timeout: 5_000 });
  await expect(page).not.toHaveURL(/[?&]item=/, { timeout: 3_000 });
});
