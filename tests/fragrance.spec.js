// @ts-check

/**
 * E2E tests for the /data/fragrance page (fragrance collection).
 *
 * ── Coverage ──────────────────────────────────────────────────────────────────
 *  1. Tab structure: Insights (default), Table
 *  2. Stats computed from fixture data (dateless dashboard — no time window)
 *  3. Entity toggle: Houses (default), Concentration (types)
 *  4. Table tab column headers
 *
 * ── Fixture summary (fragrance-data.json) ────────────────────────────────────
 *  own:  Dior Sauvage (Dior, EDP), Bleu de Chanel (Chanel, EDP), Tom Ford Oud Wood (Tom Ford, EDP)
 *  want: Chanel Allure Homme Sport (Chanel, EDT), YSL La Nuit (YSL, EDT)
 *
 *  ownCount=3, wantCount=2
 *  houseCounts: {Dior:1, Chanel:2, Tom Ford:1, YSL:1} → uniqueHouses=4
 *  typeCounts: {EDP:3, EDT:2}
 */

const { test, expect } = require("@playwright/test");
const FIXTURE = require("./fixtures/fragrance-data.json");
const { injectFixture, gotoFragrance, waitForInsights } = require("./helpers/fragrance");

// ── Shared setup ──────────────────────────────────────────────────────────────

test.beforeEach(async ({ page }) => {
  await injectFixture(page, FIXTURE);
  await gotoFragrance(page);
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

test("dateless dashboard has no time-window preset buttons", async ({ page }) => {
  await expect(page.locator("#frag-btn-alltime")).toHaveCount(0);
});

// ── 2. Stats ──────────────────────────────────────────────────────────────────

test("shows correct owned and wishlist counts from fixture", async ({ page }) => {
  await expect(page.locator("#frag-stat-own")).toHaveText("3");
  await expect(page.locator("#frag-stat-want")).toHaveText("2");
});

test("shows correct unique house count from fixture", async ({ page }) => {
  // Dior(1) + Chanel(2) + Tom Ford(1) + YSL(1) = 4 unique houses
  await expect(page.locator("#frag-stat-houses")).toHaveText("4");
});

// ── 3. Entity toggle ──────────────────────────────────────────────────────────

test("houses entity is active by default and shows Chanel as top house", async ({ page }) => {
  await expect(page.locator("[data-entity='houses']")).toHaveClass(/btn-secondary/);
  // Chanel appears 2 times (own + want), others once
  await expect(page.locator("#frag-top-list .fw-semibold").first()).toHaveText("Chanel");
});

test("concentration (types) entity toggle shows Eau de Parfum first", async ({ page }) => {
  await page.locator("[data-entity='types']").click();

  // EDP appears in 3 own fragrances, EDT in 2 want fragrances
  await expect(page.locator("#frag-top-list .fw-semibold").first()).toHaveText("Eau de Parfum");
  await expect(page.locator("[data-entity='types']")).toHaveClass(/btn-secondary/);
  await expect(page.locator("[data-entity='houses']")).toHaveClass(/btn-outline-secondary/);
});

test("switching back to houses re-activates the houses button", async ({ page }) => {
  await page.locator("[data-entity='types']").click();
  await page.locator("[data-entity='houses']").click();

  await expect(page.locator("[data-entity='houses']")).toHaveClass(/btn-secondary/);
  await expect(page.locator("[data-entity='types']")).toHaveClass(/btn-outline-secondary/);
});

// ── 4. Table tab ──────────────────────────────────────────────────────────────

test("table tab shows correct column headers", async ({ page }) => {
  await page.locator("#table-tab").click();
  await expect(page.locator("#table-tab-pane")).toBeVisible();

  const headers = page.locator("#myTable thead th");
  await expect(headers.nth(0)).toContainText("Name");
  await expect(headers.nth(1)).toContainText("Maker");
  await expect(headers.nth(4)).toContainText("Status");
});

test("table tab shows own and wishlist rows from real data", async ({ page }) => {
  await page.locator("#table-tab").click();
  await expect(page.locator("#myTable tbody tr").first()).toBeVisible({ timeout: 8_000 });
});
