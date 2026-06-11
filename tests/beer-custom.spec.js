// @ts-check

/**
 * E2E tests for the custom insight widget builder on /data/beer.html.
 *
 * ── Determinism strategy ───────────────────────────────────────────────────
 * Uses the same beer-data.json fixture + injectFixture() as beer.spec.js.
 * localStorage is cleared before the first page load via sessionStorage flag,
 * so it persists through within-test reloads (for the persistence test).
 *
 * ── Fixture recap (beer-data.json) ────────────────────────────────────────
 *   9 checkins; Brewery A: 4, Brewery B: 3, Brewery C: 2
 *   Styles: IPA - American (4), IPA - New England / Hazy (1), ...
 *   All-time top by count: Brewery A (4)
 */

const { test, expect } = require("@playwright/test");
const FIXTURE = require("./fixtures/beer-data.json");
const { injectFixture, gotoBeer, waitForInsights } = require("./helpers/beer");

// ── Shared setup ──────────────────────────────────────────────────────────────

test.beforeEach(async ({ page }) => {
  await injectFixture(page, FIXTURE);
  // Clear localStorage only on the first load; sessionStorage survives reload
  // so the persistence test can verify data survives a page.reload().
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("_ls_cleared")) {
      localStorage.clear();
      sessionStorage.setItem("_ls_cleared", "1");
    }
  });
  await gotoBeer(page);
  await waitForInsights(page);
});

// ── Helper ────────────────────────────────────────────────────────────────────

async function openCreateModal(page) {
  await page.click("#beer-custom-create");
  await expect(page.locator("#beer-custom-builder")).toBeVisible({ timeout: 5000 });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test("custom section is present on insights tab", async ({ page }) => {
  await expect(page.locator("#beer-custom-grid")).toBeAttached();
  await expect(page.locator("#beer-custom-create")).toBeVisible();
});

test("create button opens builder modal with type picker", async ({ page }) => {
  await openCreateModal(page);

  // Type picker shows leaderboard option
  const typePicker = page.locator("#beer-custom-type-picker");
  await expect(typePicker).toBeVisible();
  // InsightsWidgets is a top-level const (not a window property); access by identifier.
  await expect(typePicker.locator("button")).toHaveCount(
    await page.evaluate(() => InsightsWidgets.types().length),
  );

  // Config form and preview are rendered
  await expect(page.locator("#beer-custom-form-body")).toBeVisible();
  await expect(page.locator("#beer-custom-preview")).toBeVisible();
});

test("live preview updates when groupBy changes to brewery", async ({ page }) => {
  await openCreateModal(page);

  // Select brewery as the group-by dimension
  await page.selectOption("#beer-cfg-groupBy", "brewery");

  // Preview should show Brewery A at rank 1 (count 4, highest)
  const firstLabel = page.locator("#beer-custom-preview .fw-semibold").first();
  await expect(firstLabel).toHaveText("Brewery A");
});

test("creates widget and renders Brewery A at top of grid", async ({ page }) => {
  await openCreateModal(page);

  await page.selectOption("#beer-cfg-groupBy", "brewery");
  await page.fill("#beer-custom-title", "Top Breweries");
  await page.click("#beer-custom-save");

  // Modal closes and card appears in grid
  await expect(page.locator("#beer-custom-builder")).not.toBeVisible();
  await expect(page.locator("#beer-custom-grid .card")).toBeVisible();
  await expect(page.locator("#beer-custom-grid .card-header")).toContainText("Top Breweries");
  await expect(page.locator("#beer-custom-grid .card-body .fw-semibold").first()).toHaveText(
    "Brewery A",
  );

  // localStorage entry created
  const stored = await page.evaluate(() => localStorage.getItem("insights:beer:v1"));
  expect(stored).toBeTruthy();
  const layout = JSON.parse(stored);
  expect(layout.rows[0].cols).toHaveLength(1);
  expect(layout.rows[0].cols[0].type).toBe("leaderboard");
  expect(layout.rows[0].cols[0].title).toBe("Top Breweries");
});

test("widget persists after page reload", async ({ page }) => {
  // Create widget
  await openCreateModal(page);
  await page.selectOption("#beer-cfg-groupBy", "brewery");
  await page.fill("#beer-custom-title", "Top Breweries");
  await page.click("#beer-custom-save");
  await expect(page.locator("#beer-custom-grid .card")).toBeVisible();

  // Reload — sessionStorage flag prevents localStorage.clear() from firing again
  await page.reload();
  await waitForInsights(page);

  // Widget structure persists — title from localStorage, data from current CHECKINS
  await expect(page.locator("#beer-custom-grid .card")).toBeVisible();
  await expect(page.locator("#beer-custom-grid .card-header")).toContainText("Top Breweries");
  // At least one leaderboard item renders (verifies widget ran aggregation on reload)
  await expect(page.locator("#beer-custom-grid .card-body .fw-semibold").first()).toBeVisible();
});

test("editing widget changes groupBy and re-renders grid", async ({ page }) => {
  // Create a brewery widget first
  await openCreateModal(page);
  await page.selectOption("#beer-cfg-groupBy", "brewery");
  await page.fill("#beer-custom-title", "Top Breweries");
  await page.click("#beer-custom-save");
  await expect(page.locator("#beer-custom-grid .card-body .fw-semibold").first()).toHaveText(
    "Brewery A",
  );

  // Open edit modal
  await page.click("#beer-custom-grid button[title='Edit']");
  await expect(page.locator("#beer-custom-builder")).toBeVisible({ timeout: 5000 });

  // Type picker is hidden in edit mode
  await expect(page.locator("#beer-custom-type-picker")).toHaveClass(/d-none/);

  // Change groupBy to style
  await page.selectOption("#beer-cfg-groupBy", "style");

  // Preview updates — IPA - American is top style (count 4)
  await expect(page.locator("#beer-custom-preview .fw-semibold").first()).toContainText("IPA");

  await page.click("#beer-custom-save");

  // Grid now shows styles — first item contains IPA
  await expect(page.locator("#beer-custom-grid .card-body .fw-semibold").first()).toContainText(
    "IPA",
  );
});

test("delete button removes widget from grid and storage", async ({ page }) => {
  // Create a widget
  await openCreateModal(page);
  await page.fill("#beer-custom-title", "To Delete");
  await page.click("#beer-custom-save");
  await expect(page.locator("#beer-custom-grid .card")).toBeVisible();

  // Open edit → click delete
  await page.click("#beer-custom-grid button[title='Edit']");
  await expect(page.locator("#beer-custom-builder")).toBeVisible({ timeout: 5000 });
  await expect(page.locator("#beer-custom-delete")).not.toHaveClass(/d-none/);
  await page.click("#beer-custom-delete");

  // Grid is empty
  await expect(page.locator("#beer-custom-grid .card")).not.toBeVisible();

  // Layout in storage has no cols
  const stored = await page.evaluate(() => localStorage.getItem("insights:beer:v1"));
  const layout = stored ? JSON.parse(stored) : null;
  const widgetCount = layout?.rows?.[0]?.cols?.length ?? layout?.rows?.length ?? 0;
  expect(widgetCount).toBe(0);
});

test("width buttons change card column width", async ({ page }) => {
  await openCreateModal(page);
  await page.fill("#beer-custom-title", "Width Test");
  await page.click("#beer-custom-save");

  // Default is col-md-6 (half)
  const col = page.locator("#beer-custom-grid .col-12").first();
  await expect(col).toHaveClass(/col-md-6/);

  // Click full-width (▬)
  await col.locator("button[title='Full']").click();
  await expect(page.locator("#beer-custom-grid .col-12").first()).toHaveClass(/col-md-12/);

  // Click one-third
  await page.locator("#beer-custom-grid button[title='One-third']").click();
  await expect(page.locator("#beer-custom-grid .col-12").first()).toHaveClass(/col-md-4/);
});
