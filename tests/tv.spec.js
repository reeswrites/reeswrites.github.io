// @ts-check

/**
 * E2E tests for the /data/tv page.
 *
 * ── Coverage ──────────────────────────────────────────────────────────────────
 *  1. Tab structure: Insights (default), Table
 *  2. Summary stat cards computed from fixture data
 *  3. Rating distribution chart renders
 *  4. Genre leaderboard is default; Country and Year tabs work
 *  5. Table tab shows correct column headers
 *
 * ── Fixture summary (tv-data.json) ───────────────────────────────────────────
 *  4 shows: Alpha(JP,24eps,8/10), Beta(US,12eps,10/10), Gamma(JP,36eps,6/10), Delta(KR,8eps,unrated)
 *  totalShows=4, totalEps=80
 *  totalMinutes = 24*24 + 12*45 + 36*22 = 1908 → 32 hours
 *  Genres: Action=2, Drama=1, Comedy=1
 *  Countries: Japan=2, United States=1, South Korea=1
 */

const { test, expect } = require("@playwright/test");
const FIXTURE = require("./fixtures/tv-data.json");
const { injectFixture, gotoTV, waitForInsights } = require("./helpers/tv");

// ── Shared setup ──────────────────────────────────────────────────────────────

test.beforeEach(async ({ page }) => {
  await injectFixture(page, FIXTURE);
  await gotoTV(page);
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

// ── 2. Summary stats ──────────────────────────────────────────────────────────

test("shows correct show count from fixture", async ({ page }) => {
  await expect(page.locator("#tv-stat-shows")).toHaveText("4");
});

test("shows correct episode count from fixture", async ({ page }) => {
  await expect(page.locator("#tv-stat-episodes")).toHaveText("80");
});

test("shows correct hours watched from fixture", async ({ page }) => {
  // 24*24 + 12*45 + 36*22 = 1908 minutes → Math.round(1908/60) = 32 → "32+"
  await expect(page.locator("#tv-stat-hours")).toHaveText("32+");
});

// ── 3. Rating chart ───────────────────────────────────────────────────────────

test("rating distribution chart renders an SVG", async ({ page }) => {
  await expect(page.locator("#tv-rating-chart svg")).toBeVisible({ timeout: 10_000 });
});

// ── 4. Leaderboard ────────────────────────────────────────────────────────────

test("genre leaderboard button is active by default", async ({ page }) => {
  await expect(page.locator("[data-lb='genre']")).toHaveClass(/btn-secondary/);
});

test("genre leaderboard shows Action as top genre from fixture", async ({ page }) => {
  // Action appears in 2 shows, Drama and Comedy in 1 each
  await expect(page.locator("#tv-leaderboard .fw-semibold").first()).toHaveText("Action");
  await expect(page.locator("#tv-leaderboard .text-nowrap.text-muted").first()).toContainText("2 shows");
});

test("country leaderboard shows Japan first and activates its button", async ({ page }) => {
  await page.locator("[data-lb='country']").click();

  await expect(page.locator("#tv-leaderboard .fw-semibold").first()).toHaveText("Japan");
  await expect(page.locator("[data-lb='country']")).toHaveClass(/btn-secondary/);
  await expect(page.locator("[data-lb='genre']")).toHaveClass(/btn-outline-secondary/);
});

test("year leaderboard renders entries and activates its button", async ({ page }) => {
  await page.locator("[data-lb='year']").click();

  await expect(page.locator("#tv-leaderboard .fw-semibold").first()).toBeVisible();
  await expect(page.locator("[data-lb='year']")).toHaveClass(/btn-secondary/);
});

// ── 5. Table tab ──────────────────────────────────────────────────────────────

test("table tab shows correct column headers", async ({ page }) => {
  await page.locator("#table-tab").click();
  await expect(page.locator("#table-tab-pane")).toBeVisible();

  const headers = page.locator("#myTable thead td");
  await expect(headers.nth(0)).toContainText("Title");
  await expect(headers.nth(1)).toContainText("Year");
  await expect(headers.nth(3)).toContainText("Rating");
});

test("table tab has at least one data row from the real data", async ({ page }) => {
  await page.locator("#table-tab").click();
  await expect(page.locator("#myTable tbody tr").first()).toBeVisible({ timeout: 8_000 });
});
