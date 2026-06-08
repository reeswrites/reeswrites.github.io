// @ts-check

/**
 * E2E tests for the /data/dvds page (DVD collection).
 *
 * ── Coverage ──────────────────────────────────────────────────────────────────
 *  1. Tab structure: Insights (default), Table
 *  2. All-time stats from fixture
 *  3. Year preset buttons (2022, 2023, 2024)
 *  4. Custom date range inputs reflect current window
 *  5. Entity toggle: Directors (default), Decades, Formats
 *  6. Table tab column headers
 *
 * ── Fixture summary (dvds-data.json) ─────────────────────────────────────────
 *  5 discs across 3 years:
 *    2022: Godfather (Blu-ray, 1972), Godfather II (Blu-ray, 1974)  — Coppola
 *    2023: Blade Runner 2049 (4K Ultra HD, 2017), Arrival (4K Ultra HD, 2016) — Villeneuve
 *    2024: The Dark Knight (DVD, 2008) — Nolan
 *
 *  All-time: total=5, uniqueDirectors=3, filmDecades=3 (1970s,2010s,2000s)
 *  topDir="Francis Ford Coppola (2)", formatStr="2 Blu-ray · 2 4K Ultra HD · 1 DVD"
 *  oldest="1972", newest="2017"
 *
 *  Year 2022: total=2, uniqueDirectors=1, filmDecades=1, topDir="Francis Ford Coppola (2)"
 *  Year 2023: total=2, uniqueDirectors=1, filmDecades=1, topDir="Denis Villeneuve (2)"
 */

const { test, expect } = require("@playwright/test");
const FIXTURE = require("./fixtures/dvds-data.json");
const { injectFixture, gotoDVDs, waitForInsights } = require("./helpers/dvds");

// ── Shared setup ──────────────────────────────────────────────────────────────

test.beforeEach(async ({ page }) => {
  await injectFixture(page, FIXTURE);
  await gotoDVDs(page);
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

test("all-time stats show correct values from fixture", async ({ page }) => {
  await expect(page.locator("#dvds-stat-total")).toHaveText("5");
  await expect(page.locator("#dvds-stat-dirs")).toHaveText("3");
  await expect(page.locator("#dvds-stat-decades")).toHaveText("3");
  await expect(page.locator("#dvds-stat-topdir")).toHaveText("Francis Ford Coppola (2)");
  // Format string uses "·" separator; check key parts individually to avoid charset issues
  await expect(page.locator("#dvds-stat-formats")).toContainText("2 Blu-ray");
  await expect(page.locator("#dvds-stat-formats")).toContainText("2 4K Ultra HD");
  await expect(page.locator("#dvds-stat-formats")).toContainText("1 DVD");
  await expect(page.locator("#dvds-stat-oldest")).toHaveText("1972");
  await expect(page.locator("#dvds-stat-newest")).toHaveText("2017");
});

test("all-time preset button is active on load", async ({ page }) => {
  await expect(page.locator("#dvds-btn-alltime")).toHaveClass(/btn-secondary/);
});

// ── 3. Year presets ───────────────────────────────────────────────────────────

test("year buttons for 2022, 2023, 2024 are rendered", async ({ page }) => {
  for (const year of ["2022", "2023", "2024"]) {
    await expect(page.locator(`#dvds-year-buttons [data-year="${year}"]`)).toBeVisible();
  }
});

test("selecting year 2022 shows only the 2 Coppola Blu-rays", async ({ page }) => {
  await page.locator("#dvds-year-buttons [data-year='2022']").click();

  await expect(page.locator("#dvds-stat-total")).toHaveText("2");
  await expect(page.locator("#dvds-stat-dirs")).toHaveText("1");
  await expect(page.locator("#dvds-stat-decades")).toHaveText("1");
  await expect(page.locator("#dvds-stat-topdir")).toHaveText("Francis Ford Coppola (2)");
  await expect(page.locator("#dvds-stat-formats")).toContainText("2 Blu-ray");
  await expect(page.locator("#dvds-stat-oldest")).toHaveText("1972");
  await expect(page.locator("#dvds-stat-newest")).toHaveText("1974");
  await expect(page.locator("#dvds-year-buttons [data-year='2022']")).toHaveClass(/btn-secondary/);
});

test("selecting year 2023 shows the two Villeneuve 4K discs", async ({ page }) => {
  await page.locator("#dvds-year-buttons [data-year='2023']").click();

  await expect(page.locator("#dvds-stat-total")).toHaveText("2");
  await expect(page.locator("#dvds-stat-topdir")).toHaveText("Denis Villeneuve (2)");
  await expect(page.locator("#dvds-stat-formats")).toContainText("2 4K Ultra HD");
  await expect(page.locator("#dvds-stat-oldest")).toHaveText("2016");
  await expect(page.locator("#dvds-stat-newest")).toHaveText("2017");
});

test("clicking all-time after a year preset restores all-time stats", async ({ page }) => {
  await page.locator("#dvds-year-buttons [data-year='2022']").click();
  await page.locator("#dvds-btn-alltime").click();

  await expect(page.locator("#dvds-stat-total")).toHaveText("5");
  await expect(page.locator("#dvds-btn-alltime")).toHaveClass(/btn-secondary/);
  await expect(page.locator("#dvds-year-buttons [data-year='2022']")).toHaveClass(
    /btn-outline-secondary/,
  );
});

// ── 4. Custom date range ──────────────────────────────────────────────────────

test("custom range inputs reflect all-time window on load", async ({ page }) => {
  await expect(page.locator("#dvds-range-start")).toHaveValue("2022-05");
  await expect(page.locator("#dvds-range-end")).toHaveValue("2024-01");
});

// ── 5. Entity toggle ──────────────────────────────────────────────────────────

test("directors entity is active by default and shows Coppola first", async ({ page }) => {
  await expect(page.locator("[data-entity='directors']")).toHaveClass(/btn-secondary/);
  await expect(page.locator("#dvds-top-list .fw-semibold").first()).toHaveText(
    "Francis Ford Coppola",
  );
});

test("decades entity toggle shows most recent decade first", async ({ page }) => {
  await page.locator("[data-entity='decades']").click();

  // Sorted by year desc: 2010s(2017,2016) > 2000s(2008) > 1970s(1972,1974)
  await expect(page.locator("#dvds-top-list .fw-semibold").first()).toHaveText("2010s");
  await expect(page.locator("[data-entity='decades']")).toHaveClass(/btn-secondary/);
});

test("formats entity toggle shows Blu-ray and 4K Ultra HD first (tied at 2)", async ({ page }) => {
  await page.locator("[data-entity='formats']").click();

  // Sorted by count desc (stable): Blu-ray(2) then 4K Ultra HD(2) then DVD(1)
  await expect(page.locator("#dvds-top-list .fw-semibold").first()).toHaveText("Blu-ray");
  await expect(page.locator("[data-entity='formats']")).toHaveClass(/btn-secondary/);
});

test("entity toggle persists across window changes", async ({ page }) => {
  await page.locator("[data-entity='formats']").click();
  await page.locator("#dvds-year-buttons [data-year='2022']").click();

  // In 2022, only Blu-ray format
  await expect(page.locator("#dvds-top-list .fw-semibold").first()).toHaveText("Blu-ray");
  await expect(page.locator("[data-entity='formats']")).toHaveClass(/btn-secondary/);
});

// ── 6. Table tab ──────────────────────────────────────────────────────────────

test("table tab shows correct column headers", async ({ page }) => {
  await page.locator("#table-tab").click();
  await expect(page.locator("#table-tab-pane")).toBeVisible();

  const headers = page.locator("#myTable thead td");
  await expect(headers.nth(0)).toContainText("Title");
  await expect(headers.nth(1)).toContainText("Year");
  await expect(headers.nth(2)).toContainText("Director");
});
