// @ts-check

/**
 * E2E tests for the /data/beer page (Insights tab).
 *
 * ── Determinism strategy ─────────────────────────────────────────────────────
 * Beer data is inlined via Liquid, so injectFixture() intercepts the beer.html
 * request and replaces the CHECKINS array with beer-data.json.  Date is frozen
 * to June 2, 2026 for deterministic time-relative presets.
 *
 * ── Fixture summary (beer-data.json) ─────────────────────────────────────────
 *  9 checkins across 8 weeks
 *
 *  Unique beers: 7
 *    Alpha IPA (Brewery A): entries 0, 2, 7  → count=3, avg=(4.0+4.25+4.5)/3=4.25
 *    Beta Stout (Brewery B): entry 1          → count=1, avg=3.5
 *    Alpha NEIPA (Brewery A): entry 3         → count=1, avg=4.5
 *    Beta Sour (Brewery B): entry 4           → count=1, avg=3.75
 *    Gamma IPA (Brewery C): entry 5           → count=1, avg=3.5
 *    Gamma Pale (Brewery C): entry 6          → count=1, avg=4.0
 *    Beta Wheat (Brewery B): entry 8          → count=1, avg=4.25
 *
 *  Styles (5): IPA - American (4), IPA - New England / Hazy (1),
 *              Stout - American (1), Sour - Fruited (1), Pale Ale - American (1),
 *              Wheat Beer - American (1)  [6 styles total]
 *
 *  Breweries (3): Brewery A (4), Brewery B (3), Brewery C (2)
 *
 *  Overall avg rating: (4.0+3.5+4.25+4.5+3.75+3.5+4.0+4.5+4.25)/9 = 36.25/9 ≈ 4.03
 *
 *  Weeks (derived, Monday-start):
 *    idx 0: 2023-01-09  idx 1: 2023-06-05  idx 2: 2024-03-18  idx 3: 2024-10-28
 *    idx 4: 2025-06-30  idx 5: 2025-10-13  idx 6: 2026-01-19  idx 7: 2026-05-25
 *
 *  Year windows:
 *    2023 → weeks 0-1 → 2 checkins, 2 beers, 2 styles, 2 breweries, avg 3.75
 *    2024 → weeks 2-3 → 3 checkins, 3 beers, 3 styles, 2 breweries, avg 4.17
 *    2025 → weeks 4-5 → 2 checkins, 2 beers, 2 styles, 1 brewery,  avg 3.75
 *    2026 → weeks 6-7 → 2 checkins, 2 beers, 2 styles, 2 breweries, avg 4.38
 *
 *  Time presets (frozen to 2026-06-02):
 *    Last 30 days  (≥ 2026-05-03) → week 7 → 1 checkin
 *    Last 12 months (≥ 2025-06-02) → weeks 4-7 → 4 checkins
 */

const { test, expect } = require("@playwright/test");
const FIXTURE = require("./fixtures/beer-data.json");
const { injectFixture, gotoBeer, waitForInsights } = require("./helpers/beer");

// ── Shared setup ──────────────────────────────────────────────────────────────

test.beforeEach(async ({ page }) => {
  await injectFixture(page, FIXTURE);
  await gotoBeer(page);
  await waitForInsights(page);
});

// ── 1. Page structure ─────────────────────────────────────────────────────────

test("insights tab is active by default", async ({ page }) => {
  await expect(page.locator("#insights-tab")).toHaveClass(/active/);
  await expect(page.locator("#insights-tab-pane")).toHaveClass(/show active/);
});

test("renders three tabs in order: Insights, Calendar, Table", async ({ page }) => {
  const tabs = page.locator("#myTab .nav-link");
  await expect(tabs).toHaveCount(3);
  await expect(tabs.nth(0)).toHaveAttribute("id", "insights-tab");
  await expect(tabs.nth(1)).toHaveAttribute("id", "calendar-tab");
  await expect(tabs.nth(2)).toHaveAttribute("id", "table-tab");
});

test("renders preset buttons and dynamic year buttons", async ({ page }) => {
  await expect(page.locator("#beer-btn-alltime")).toBeVisible();
  await expect(page.locator("#beer-btn-last30")).toBeVisible();
  await expect(page.locator("#beer-btn-last12")).toBeVisible();
  for (const year of ["2023", "2024", "2025", "2026"]) {
    await expect(page.locator(`#beer-year-buttons [data-year="${year}"]`)).toBeVisible();
  }
});

// ── 2. All-time stats ─────────────────────────────────────────────────────────

test("all-time window shows correct summary stats", async ({ page }) => {
  await expect(page.locator("#beer-stat-beers")).toHaveText("7");
  await expect(page.locator("#beer-stat-styles")).toHaveText("6");
  await expect(page.locator("#beer-stat-breweries")).toHaveText("3");
  await expect(page.locator("#beer-stat-avg-rating")).toHaveText("4.03");
  await expect(page.locator("#beer-stat-top-style")).toHaveText("IPA - American (4)");
  await expect(page.locator("#beer-stat-top-brewery")).toHaveText("Brewery A (4)");
});

test("all-time preset button is active on load", async ({ page }) => {
  await expect(page.locator("#beer-btn-alltime")).toHaveClass(/btn-secondary/);
  await expect(page.locator("#beer-btn-alltime")).not.toHaveClass(/btn-outline-secondary/);
});

// ── 3. Year presets ───────────────────────────────────────────────────────────

test("selecting year 2023 filters to that year", async ({ page }) => {
  await page.locator("#beer-year-buttons [data-year='2023']").click();

  await expect(page.locator("#beer-stat-beers")).toHaveText("2");
  await expect(page.locator("#beer-stat-styles")).toHaveText("2");
  await expect(page.locator("#beer-stat-breweries")).toHaveText("2");
  await expect(page.locator("#beer-stat-avg-rating")).toHaveText("3.75");
  await expect(page.locator("#beer-year-buttons [data-year='2023']")).toHaveClass(/btn-secondary/);
  await expect(page.locator("#beer-btn-alltime")).toHaveClass(/btn-outline-secondary/);
});

test("selecting year 2024 shows correct stats", async ({ page }) => {
  await page.locator("#beer-year-buttons [data-year='2024']").click();

  await expect(page.locator("#beer-stat-beers")).toHaveText("3");
  await expect(page.locator("#beer-stat-styles")).toHaveText("3");
  await expect(page.locator("#beer-stat-breweries")).toHaveText("2");
  await expect(page.locator("#beer-stat-avg-rating")).toHaveText("4.17");
});

test("selecting year 2025 shows correct stats", async ({ page }) => {
  await page.locator("#beer-year-buttons [data-year='2025']").click();

  await expect(page.locator("#beer-stat-beers")).toHaveText("2");
  await expect(page.locator("#beer-stat-styles")).toHaveText("2");
  await expect(page.locator("#beer-stat-breweries")).toHaveText("1");
  await expect(page.locator("#beer-stat-avg-rating")).toHaveText("3.75");
  await expect(page.locator("#beer-stat-top-brewery")).toHaveText("Brewery C (2)");
});

test("selecting year 2026 shows correct stats", async ({ page }) => {
  await page.locator("#beer-year-buttons [data-year='2026']").click();

  await expect(page.locator("#beer-stat-beers")).toHaveText("2");
  await expect(page.locator("#beer-stat-styles")).toHaveText("2");
  await expect(page.locator("#beer-stat-avg-rating")).toHaveText("4.38");
});

test("clicking all-time after a year preset reactivates the all-time button", async ({ page }) => {
  await page.locator("#beer-year-buttons [data-year='2023']").click();
  await page.locator("#beer-btn-alltime").click();

  await expect(page.locator("#beer-stat-beers")).toHaveText("7");
  await expect(page.locator("#beer-btn-alltime")).toHaveClass(/btn-secondary/);
  await expect(page.locator("#beer-year-buttons [data-year='2023']")).toHaveClass(
    /btn-outline-secondary/,
  );
});

// ── 4. Built-in presets ───────────────────────────────────────────────────────

test("'Last 30 days' shows only the checkin from 2026-05-25", async ({ page }) => {
  await page.locator("#beer-btn-last30").click();

  await expect(page.locator("#beer-stat-beers")).toHaveText("1");
  await expect(page.locator("#beer-stat-avg-rating")).toHaveText("4.25");
  await expect(page.locator("#beer-btn-last30")).toHaveClass(/btn-secondary/);
});

test("'Last 12 months' covers the 4 checkins from 2025-06 onwards", async ({ page }) => {
  await page.locator("#beer-btn-last12").click();

  await expect(page.locator("#beer-stat-beers")).toHaveText("4");
  await expect(page.locator("#beer-stat-avg-rating")).toHaveText("4.06");
  await expect(page.locator("#beer-btn-last12")).toHaveClass(/btn-secondary/);
});

// ── 5. Custom range ───────────────────────────────────────────────────────────

test("custom range inputs reflect current window months on load", async ({ page }) => {
  await expect(page.locator("#beer-range-start")).toHaveValue("2023-01");
  await expect(page.locator("#beer-range-end")).toHaveValue("2026-05");
});

test("custom range picker filters data to specified months", async ({ page }) => {
  // 2024-03 through 2024-11 → all 3 entries in 2024
  await page.locator("#beer-range-start").fill("2024-03");
  await page.locator("#beer-range-end").fill("2024-11");
  await page.locator("#beer-range-end").dispatchEvent("change");

  await expect(page.locator("#beer-stat-beers")).toHaveText("3");
  await expect(page.locator("#beer-stat-breweries")).toHaveText("2");
});

test("updating start month re-applies the range filter", async ({ page }) => {
  await page.locator("#beer-range-start").fill("2025-01");
  await page.locator("#beer-range-start").dispatchEvent("change");

  // weeks 4-7: entries 5,6,7,8 → 4 checkins
  await expect(page.locator("#beer-stat-beers")).toHaveText("4");
});

// ── 6. Entity toggle — styles (default) ──────────────────────────────────────

test("styles leaderboard shows correct top entry with count and avg", async ({ page }) => {
  // "IPA - American": 4 beers, avg = (4.0+4.25+3.5+4.5)/4 = 4.0625 → "4.06"
  const firstLabel = page.locator("#beer-top-list .fw-semibold").first();
  const firstCount = page.locator("#beer-top-list .text-nowrap").first();
  await expect(firstLabel).toHaveText("IPA - American");
  await expect(firstCount).toHaveText("4 beers (4.06 avg)");
});

test("styles leaderboard shows progress bars", async ({ page }) => {
  await expect(page.locator("#beer-top-list .progress").first()).toBeVisible();
});

test("styles button is active by default", async ({ page }) => {
  await expect(page.locator("[data-entity='styles']")).toHaveClass(/btn-secondary/);
});

// ── 7. Entity toggle — breweries ──────────────────────────────────────────────

test("breweries leaderboard shows correct ranking", async ({ page }) => {
  await page.locator("[data-entity='breweries']").click();

  const labels = page.locator("#beer-top-list .fw-semibold");
  await expect(labels.nth(0)).toHaveText("Brewery A");
  await expect(labels.nth(1)).toHaveText("Brewery B");
  await expect(labels.nth(2)).toHaveText("Brewery C");
  await expect(page.locator("[data-entity='breweries']")).toHaveClass(/btn-secondary/);
});

test("breweries leaderboard count includes avg rating", async ({ page }) => {
  await page.locator("[data-entity='breweries']").click();

  // Brewery A: 4 beers, ratings=[4.0, 4.25, 4.5, 4.5], avg=4.3125 → "4.31"
  await expect(page.locator("#beer-top-list .text-nowrap").first()).toHaveText(
    "4 beers (4.31 avg)",
  );
});

// ── 8. Entity toggle — beers ──────────────────────────────────────────────────

test("beers leaderboard top entry is Alpha IPA with avg rating only (no count)", async ({
  page,
}) => {
  await page.locator("[data-entity='beers']").click();

  // Alpha IPA has count=3 (highest), avg=(4.0+4.25+4.5)/3=4.25
  await expect(page.locator("#beer-top-list .fw-semibold").first()).toHaveText("Alpha IPA");
  await expect(page.locator("#beer-top-list .text-nowrap").first()).toHaveText("4.25");
});

test("beers leaderboard shows brewery as sub-text", async ({ page }) => {
  await page.locator("[data-entity='beers']").click();

  await expect(page.locator("#beer-top-list small.text-muted").first()).toHaveText("Brewery A");
});

test("beers leaderboard shows no progress bars", async ({ page }) => {
  await page.locator("[data-entity='beers']").click();

  await expect(page.locator("#beer-top-list .progress")).toHaveCount(0);
});

test("beers ranked by count desc then avg rating desc on tie", async ({ page }) => {
  await page.locator("[data-entity='beers']").click();

  // After Alpha IPA (count=3), all others are count=1 — sorted by avg desc:
  // Alpha NEIPA (4.5) should be #2
  await expect(page.locator("#beer-top-list .fw-semibold").nth(1)).toHaveText("Alpha NEIPA");
});

// ── 9. Entity toggle + window interaction ─────────────────────────────────────

test("entity toggle persists across window changes", async ({ page }) => {
  await page.locator("[data-entity='breweries']").click();
  await page.locator("#beer-year-buttons [data-year='2025']").click();

  // 2025 has only Brewery C
  await expect(page.locator("#beer-top-list .fw-semibold").first()).toHaveText("Brewery C");
  await expect(page.locator("[data-entity='breweries']")).toHaveClass(/btn-secondary/);
});

// ── 10. Charts ────────────────────────────────────────────────────────────────

test("timeline chart renders an SVG", async ({ page }) => {
  await expect(page.locator("#beer-timeline-chart svg")).toBeVisible({ timeout: 10_000 });
});

test("timeline chart re-renders when the window changes", async ({ page }) => {
  await page.locator("#beer-year-buttons [data-year='2024']").click();
  await expect(page.locator("#beer-timeline-chart svg")).toBeVisible({ timeout: 10_000 });
});

test("rating distribution chart renders an SVG", async ({ page }) => {
  await expect(page.locator("#beer-rating-chart svg")).toBeVisible({ timeout: 10_000 });
});

test("rating distribution re-renders when window changes", async ({ page }) => {
  await page.locator("#beer-year-buttons [data-year='2026']").click();
  await expect(page.locator("#beer-rating-chart svg")).toBeVisible({ timeout: 10_000 });
});

// ── 11. Other tabs ────────────────────────────────────────────────────────────

test("table view shows correct column headers", async ({ page }) => {
  await page.locator("#table-tab").click();
  await expect(page.locator("#table-tab-pane")).toBeVisible();

  const headers = page.locator("#myTable thead td");
  await expect(headers.nth(1)).toContainText("Name");
  await expect(headers.nth(2)).toContainText("Brewery");
  await expect(headers.nth(3)).toContainText("Style");
  await expect(headers.nth(5)).toContainText("Rating");
  await expect(headers.nth(6)).toContainText("Date");
});

test("switching back to insights from another tab keeps stats correct", async ({ page }) => {
  await page.locator("#table-tab").click();
  await page.locator("#insights-tab").click();

  await expect(page.locator("#beer-stat-beers")).toHaveText("7");
});

// ── 12. Genre filter bar ──────────────────────────────────────────────────────
// Filter bar reads data-genre from Liquid-rendered rows (real beers data).

test("genre (beer type) filter bar is present in table tab", async ({ page }) => {
  await page.locator("#table-tab").click();
  await expect(page.locator("#data-filter-bar")).toBeVisible();
  await expect(page.locator("#filter-genre")).toBeVisible();
});

test("beer type filter bar has a star-rating control", async ({ page }) => {
  await page.locator("#table-tab").click();
  await expect(page.locator("#filter-star-slider")).toBeVisible();
});

test("beer type select is populated with options from table data", async ({ page }) => {
  await page.locator("#table-tab").click();
  const count = await page.locator("#filter-genre option").count();
  expect(count).toBeGreaterThanOrEqual(2); // "All" + at least one type
  await expect(page.locator("#filter-genre option").first()).toContainText("All");
});

test("selecting a beer type filters the DataTable", async ({ page }) => {
  await page.locator("#table-tab").click();
  // Pick the second option (first real genre, not "All")
  const firstGenre = page.locator("#filter-genre option").nth(1);
  const genreValue = await firstGenre.getAttribute("value");
  await page.locator("#filter-genre").selectOption(genreValue ?? "");
  await expect(page.locator("#myTable_info")).toContainText("filtered from", { timeout: 5_000 });
});

// ── 13. Detail modal ──────────────────────────────────────────────────────────

test("beer table rows have info buttons with data-modal-id", async ({ page }) => {
  await page.locator("#table-tab").click();
  await expect(page.locator("#myTable tbody [data-modal-id]").first()).toBeVisible({
    timeout: 5_000,
  });
});

test("clicking a beer info button opens the detail modal", async ({ page }) => {
  await page.locator("#table-tab").click();
  await page.locator("#myTable tbody [data-modal-id]").first().click();
  await expect(page.locator("#dataModal")).toBeVisible({ timeout: 5_000 });
});

test("beer modal title is non-empty after opening", async ({ page }) => {
  await page.locator("#table-tab").click();
  await page.locator("#myTable tbody [data-modal-id]").first().click();
  await expect(page.locator("#dataModalLabel")).not.toBeEmpty({ timeout: 5_000 });
});

test("opening beer modal sets ?item= in the URL", async ({ page }) => {
  await page.locator("#table-tab").click();
  await page.locator("#myTable tbody [data-modal-id]").first().click();
  await expect(page.locator("#dataModal")).toBeVisible({ timeout: 5_000 });
  await expect(page).toHaveURL(/[?&]item=/);
});

test("closing beer modal clears ?item= from the URL", async ({ page }) => {
  await page.locator("#table-tab").click();
  await page.locator("#myTable tbody [data-modal-id]").first().click();
  await expect(page.locator("#dataModal")).toBeVisible({ timeout: 5_000 });
  await page.locator("#dataModal .btn-close").click();
  await expect(page.locator("#dataModal")).not.toBeVisible({ timeout: 5_000 });
  await expect(page).not.toHaveURL(/[?&]item=/, { timeout: 3_000 });
});
