// @ts-check

/**
 * E2E tests for the /data/dvds page (DVD collection).
 *
 * ── Coverage ──────────────────────────────────────────────────────────────────
 *  1. Tab structure: Insights (default), Table
 *  2. All-time stats from fixture (dateless page — no time-range controls)
 *  3. Entity toggle: Directors (default), Decades, Formats
 *  4. Table tab column headers
 *
 * ── Fixture summary (dvds-data.json) ─────────────────────────────────────────
 *  5 discs: Godfather (Blu-ray, 1972), Godfather II (Blu-ray, 1974) — Coppola
 *           Blade Runner 2049 (4K Ultra HD, 2017), Arrival (4K, 2016) — Villeneuve
 *           The Dark Knight (DVD, 2008) — Nolan
 *
 *  All-time: total=5, uniqueDirectors=3, filmDecades=3 (1970s,2010s,2000s)
 *  topDir="Francis Ford Coppola (2)", formatStr="2 Blu-ray · 2 4K Ultra HD · 1 DVD"
 *  oldest="1972", newest="2017"
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

// ── 3. Entity toggle ──────────────────────────────────────────────────────────

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

// ── 6. Table tab ──────────────────────────────────────────────────────────────

test("table tab shows correct column headers", async ({ page }) => {
  await page.locator("#table-tab").click();
  await expect(page.locator("#table-tab-pane")).toBeVisible();

  const headers = page.locator("#myTable thead td");
  await expect(headers.nth(1)).toContainText("Title");
  await expect(headers.nth(2)).toContainText("Year");
  await expect(headers.nth(3)).toContainText("Director");
});
