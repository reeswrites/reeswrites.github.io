// @ts-check

/**
 * E2E tests for the /data/records page (record collection).
 *
 * ── Coverage ──────────────────────────────────────────────────────────────────
 *  1. Tab structure: Insights (default), Table
 *  2. All-time stats from fixture
 *  3. Time-window presets: All time, year buttons (2022, 2023, 2024)
 *  4. Custom date range inputs reflect current window
 *  5. Entity toggle: Artists (default), Decades, Genres
 *  6. Table tab column headers
 *
 * ── Fixture summary (records-data.json) ──────────────────────────────────────
 *  5 records: 2 by Artist Alpha (1990, 1985), 2 by Artist Beta (2000, 1995), 1 by Artist Gamma (1970)
 *  datePurchased: 2022-03-15, 2022-06-20, 2023-01-10, 2023-08-05, 2024-02-28
 *
 *  All-time:  total=5, uniqueArtists=3, decadesSpanned=4, mostCollected="Artist Alpha (2)"
 *  Year 2022: total=2, uniqueArtists=1, decadesSpanned=2, mostCollected="Artist Alpha (2)"
 *  Year 2023: total=2, uniqueArtists=2, decadesSpanned=2
 *  Year 2024: total=1, uniqueArtists=1, decadesSpanned=1
 *
 *  Leaderboard (artists, all-time): Artist Alpha (2), Artist Beta (2), Artist Gamma (1)
 *  Leaderboard (genres, all-time):  Rock (2), Jazz (2), Classical (1)
 */

const { test, expect } = require("@playwright/test");
const FIXTURE = require("./fixtures/records-data.json");
const { injectFixture, gotoRecords, waitForInsights } = require("./helpers/records");

// ── Shared setup ──────────────────────────────────────────────────────────────

test.beforeEach(async ({ page }) => {
  await injectFixture(page, FIXTURE);
  await gotoRecords(page);
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

// ── 2. All-time stats ─────────────────────────────────────────────────────────

test("all-time stats show correct totals from fixture", async ({ page }) => {
  await expect(page.locator("#records-stat-total")).toHaveText("5");
  await expect(page.locator("#records-stat-artists")).toHaveText("3");
  await expect(page.locator("#records-stat-decades")).toHaveText("4");
  await expect(page.locator("#records-stat-top")).toHaveText("Artist Alpha (2)");
});

test("all-time preset button is active on load", async ({ page }) => {
  await expect(page.locator("#records-btn-alltime")).toHaveClass(/btn-secondary/);
  await expect(page.locator("#records-btn-alltime")).not.toHaveClass(/btn-outline-secondary/);
});

// ── 3. Year presets ───────────────────────────────────────────────────────────

test("year buttons for 2022, 2023, 2024 are rendered", async ({ page }) => {
  for (const year of ["2022", "2023", "2024"]) {
    await expect(page.locator(`#records-year-buttons [data-year="${year}"]`)).toBeVisible();
  }
});

test("selecting year 2022 shows only the 2 records purchased that year", async ({ page }) => {
  await page.locator("#records-year-buttons [data-year='2022']").click();

  await expect(page.locator("#records-stat-total")).toHaveText("2");
  await expect(page.locator("#records-stat-artists")).toHaveText("1");
  await expect(page.locator("#records-stat-decades")).toHaveText("2");
  await expect(page.locator("#records-stat-top")).toHaveText("Artist Alpha (2)");
  await expect(page.locator("#records-year-buttons [data-year='2022']")).toHaveClass(
    /btn-secondary/,
  );
  await expect(page.locator("#records-btn-alltime")).toHaveClass(/btn-outline-secondary/);
});

test("selecting year 2023 shows the 2 records from that year", async ({ page }) => {
  await page.locator("#records-year-buttons [data-year='2023']").click();

  await expect(page.locator("#records-stat-total")).toHaveText("2");
  await expect(page.locator("#records-stat-artists")).toHaveText("2");
  await expect(page.locator("#records-stat-decades")).toHaveText("2");
});

test("selecting year 2024 shows the single record from that year", async ({ page }) => {
  await page.locator("#records-year-buttons [data-year='2024']").click();

  await expect(page.locator("#records-stat-total")).toHaveText("1");
  await expect(page.locator("#records-stat-artists")).toHaveText("1");
});

test("clicking all-time after a year preset reactivates the all-time button", async ({ page }) => {
  await page.locator("#records-year-buttons [data-year='2022']").click();
  await page.locator("#records-btn-alltime").click();

  await expect(page.locator("#records-stat-total")).toHaveText("5");
  await expect(page.locator("#records-btn-alltime")).toHaveClass(/btn-secondary/);
  await expect(page.locator("#records-year-buttons [data-year='2022']")).toHaveClass(
    /btn-outline-secondary/,
  );
});

// ── 4. Custom date range ──────────────────────────────────────────────────────

test("custom range inputs reflect all-time window on load", async ({ page }) => {
  // First week ≥ 2022-03-14 → "2022-03", last week ≥ 2024-02-26 → "2024-02"
  await expect(page.locator("#records-range-start")).toHaveValue("2022-03");
  await expect(page.locator("#records-range-end")).toHaveValue("2024-02");
});

// ── 5. Entity toggle ──────────────────────────────────────────────────────────

test("artists entity is active by default and shows Artist Alpha at top", async ({ page }) => {
  await expect(page.locator("[data-entity='artists']")).toHaveClass(/btn-secondary/);
  await expect(page.locator("#records-top-list .fw-semibold").first()).toHaveText("Artist Alpha");
});

test("decades entity toggle shows 1990s as top decade (count 2)", async ({ page }) => {
  await page.locator("[data-entity='decades']").click();

  // All-time: 1990s has count=2 (albums 1990 and 1995), sorted by count desc first
  await expect(page.locator("#records-top-list .fw-semibold").first()).toHaveText("1990s");
  await expect(page.locator("[data-entity='decades']")).toHaveClass(/btn-secondary/);
});

test("genres entity toggle shows Rock and Jazz (tied at 2) with Rock first", async ({ page }) => {
  await page.locator("[data-entity='genres']").click();

  await expect(page.locator("#records-top-list .fw-semibold").first()).toHaveText("Rock");
  await expect(page.locator("[data-entity='genres']")).toHaveClass(/btn-secondary/);
});

// ── 6. Table tab ──────────────────────────────────────────────────────────────

test("table tab shows correct column headers", async ({ page }) => {
  await page.locator("#table-tab").click();
  await expect(page.locator("#table-tab-pane")).toBeVisible();

  const headers = page.locator("#myTable thead td");
  await expect(headers.nth(0)).toContainText("Album Name");
  await expect(headers.nth(1)).toContainText("Artist");
  await expect(headers.nth(3)).toContainText("Date Purchased");
});

// ── 7. Genre filter bar ────────────────────────────────────────────────────────
// Note: the filter bar reads data-genre from Liquid-rendered rows (real data),
// not from the injected RECORDS fixture. Tests use real _data/records.json genres.

test("genre filter bar is present in table tab", async ({ page }) => {
  await page.locator("#table-tab").click();
  await expect(page.locator("#data-filter-bar")).toBeVisible();
  await expect(page.locator("#filter-genre")).toBeVisible();
});

test("genre select is populated with options from table row data", async ({ page }) => {
  await page.locator("#table-tab").click();
  const opts = page.locator("#filter-genre option");
  // Must have at least "All genres" + one genre option
  const count = await opts.count();
  expect(count).toBeGreaterThanOrEqual(2);
  await expect(opts.first()).toContainText("All");
});

test("selecting a genre filters the DataTable", async ({ page }) => {
  await page.locator("#table-tab").click();
  await page.locator("#filter-genre").selectOption("rock");
  // DataTables info text shows "filtered from N total entries" when a filter is active
  await expect(page.locator("#myTable_info")).toContainText("filtered from", { timeout: 5_000 });
});

test("resetting genre to All removes the filter", async ({ page }) => {
  await page.locator("#table-tab").click();
  await page.locator("#filter-genre").selectOption("rock");
  await page.locator("#filter-genre").selectOption(""); // back to All genres
  await expect(page.locator("#myTable_info")).not.toContainText("filtered from", {
    timeout: 5_000,
  });
});

// ── 8. Detail modal ────────────────────────────────────────────────────────────
// Note: modal items are built from real _data/records.json at Jekyll build time.
// Tests use the first visible row to remain deterministic regardless of data size.

test("table rows have info buttons with data-modal-id", async ({ page }) => {
  await page.locator("#table-tab").click();
  await expect(page.locator("#myTable tbody [data-modal-id]").first()).toBeVisible({
    timeout: 5_000,
  });
  const count = await page.locator("#myTable tbody [data-modal-id]").count();
  expect(count).toBeGreaterThan(0);
});

test("clicking an info button opens the detail modal", async ({ page }) => {
  await page.locator("#table-tab").click();
  await page.locator("#myTable tbody [data-modal-id]").first().click();
  await expect(page.locator("#dataModal")).toBeVisible({ timeout: 5_000 });
});

test("modal title is non-empty after opening", async ({ page }) => {
  await page.locator("#table-tab").click();
  await page.locator("#myTable tbody [data-modal-id]").first().click();
  await expect(page.locator("#dataModalLabel")).not.toBeEmpty({ timeout: 5_000 });
});

test("modal body has content after opening", async ({ page }) => {
  await page.locator("#table-tab").click();
  await page.locator("#myTable tbody [data-modal-id]").first().click();
  await expect(page.locator("#dataModalBody")).not.toBeEmpty({ timeout: 5_000 });
});

test("closing the modal hides it", async ({ page }) => {
  await page.locator("#table-tab").click();
  await page.locator("#myTable tbody [data-modal-id]").first().click();
  await expect(page.locator("#dataModal")).toBeVisible({ timeout: 5_000 });
  await page.locator("#dataModal .btn-close").click();
  await expect(page.locator("#dataModal")).not.toBeVisible({ timeout: 5_000 });
});

test("opening modal sets ?item= in the URL", async ({ page }) => {
  await page.locator("#table-tab").click();
  await page.locator("#myTable tbody [data-modal-id]").first().click();
  await expect(page.locator("#dataModal")).toBeVisible({ timeout: 5_000 });
  await expect(page).toHaveURL(/[?&]item=/);
});

test("closing modal clears ?item= from the URL", async ({ page }) => {
  await page.locator("#table-tab").click();
  await page.locator("#myTable tbody [data-modal-id]").first().click();
  await expect(page.locator("#dataModal")).toBeVisible({ timeout: 5_000 });
  await page.locator("#dataModal .btn-close").click();
  await expect(page.locator("#dataModal")).not.toBeVisible({ timeout: 5_000 });
  // hidden.bs.modal fires asynchronously; wait for URL to update
  await expect(page).not.toHaveURL(/[?&]item=/, { timeout: 3_000 });
});
