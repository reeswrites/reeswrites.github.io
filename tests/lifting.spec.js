// @ts-check

/**
 * E2E tests for the /data/lifting page (lifting workouts).
 *
 * ── Coverage ──────────────────────────────────────────────────────────────────
 *  1. All-time stats from fixture
 *  2. Year preset buttons (2023, 2024)
 *  3. Entity toggle: Sessions Per Type, Reps Per Movement, Reps Per Target Muscle
 *  4. Movement progress section: dropdown, stats text
 *
 * ── Fixture summary (lifting-data.json) ──────────────────────────────────────
 *  4 workouts (2 push, 2 pull) spanning 2023-2024:
 *    2023-01-09: push (Bench Press 28 + Overhead Press 22 + Deadlift 15 = 65 reps)
 *    2023-01-16: pull (Pull Up 19 + Bent Over Row 30 = 49 reps)
 *    2023-06-05: push (Bench Press 32 + Deadlift 14 = 46 reps)
 *    2024-01-08: pull (Pull Up 26 + Bent Over Row 28 = 54 reps)
 *
 *  All-time: totalSessions=4, totalReps=214, avgPerWeek=1.0 (4 sessions in 4 distinct weeks)
 *  Year 2023: totalSessions=3, totalReps=160
 *  Year 2024: totalSessions=1, totalReps=54
 *
 *  Progress: 3 weighted movements with ≥2 dated sessions (Bench Press, Deadlift, Bent Over Row)
 *  Pull Up (weight=0) is excluded from progress series by buildSeries()
 */

const { test, expect } = require("@playwright/test");
const FIXTURE = require("./fixtures/lifting-data.json");
const { injectFixture, gotoLifting, waitForInsights } = require("./helpers/lifting");

// ── Shared setup ──────────────────────────────────────────────────────────────

test.beforeEach(async ({ page }) => {
  await injectFixture(page, FIXTURE);
  await gotoLifting(page);
  await waitForInsights(page);
});

// ── 1. All-time stats ─────────────────────────────────────────────────────────

test("all-time stats show correct values from fixture", async ({ page }) => {
  await expect(page.locator("#lifting-stat-sessions")).toHaveText("4");
  await expect(page.locator("#lifting-stat-reps")).toHaveText("214");
  await expect(page.locator("#lifting-stat-avgweek")).toHaveText("1.0");
});

test("all-time preset button is active on load", async ({ page }) => {
  await expect(page.locator("#lifting-btn-alltime")).toHaveClass(/btn-secondary/);
});

// ── 2. Year presets ───────────────────────────────────────────────────────────

test("year buttons for 2023 and 2024 are rendered", async ({ page }) => {
  await expect(page.locator("#lifting-year-buttons [data-year='2023']")).toBeVisible();
  await expect(page.locator("#lifting-year-buttons [data-year='2024']")).toBeVisible();
});

test("selecting year 2023 shows only the 3 workouts from that year", async ({ page }) => {
  await page.locator("#lifting-year-buttons [data-year='2023']").click();

  await expect(page.locator("#lifting-stat-sessions")).toHaveText("3");
  await expect(page.locator("#lifting-stat-reps")).toHaveText("160");
  await expect(page.locator("#lifting-year-buttons [data-year='2023']")).toHaveClass(
    /btn-secondary/,
  );
  await expect(page.locator("#lifting-btn-alltime")).toHaveClass(/btn-outline-secondary/);
});

test("selecting year 2024 shows the single workout from that year", async ({ page }) => {
  await page.locator("#lifting-year-buttons [data-year='2024']").click();

  await expect(page.locator("#lifting-stat-sessions")).toHaveText("1");
  await expect(page.locator("#lifting-stat-reps")).toHaveText("54");
});

test("clicking all-time after a year preset restores all-time stats", async ({ page }) => {
  await page.locator("#lifting-year-buttons [data-year='2023']").click();
  await page.locator("#lifting-btn-alltime").click();

  await expect(page.locator("#lifting-stat-sessions")).toHaveText("4");
  await expect(page.locator("#lifting-btn-alltime")).toHaveClass(/btn-secondary/);
});

// ── 3. Entity toggle ──────────────────────────────────────────────────────────

test("sessions-per-type entity is active by default and shows Push and Pull", async ({ page }) => {
  await expect(page.locator("[data-entity='types']")).toHaveClass(/btn-secondary/);

  const labels = page.locator("#lifting-top-list .fw-semibold");
  await expect(labels).toHaveCount(2);
  await expect(labels.nth(0)).toHaveText("Push");
  await expect(labels.nth(1)).toHaveText("Pull");
});

test("movements entity toggle shows at least one movement with reps", async ({ page }) => {
  await page.locator("[data-entity='movements']").click();

  await expect(page.locator("#lifting-top-list .fw-semibold").first()).toBeVisible();
  await expect(page.locator("[data-entity='movements']")).toHaveClass(/btn-secondary/);
});

test("muscles entity toggle shows at least one muscle group", async ({ page }) => {
  await page.locator("[data-entity='muscles']").click();

  await expect(page.locator("#lifting-top-list .fw-semibold").first()).toBeVisible();
  await expect(page.locator("[data-entity='muscles']")).toHaveClass(/btn-secondary/);
});

// ── 4. Movement progress section ─────────────────────────────────────────────

test("movement progress section has a movement select dropdown", async ({ page }) => {
  await expect(page.locator("#lift-select")).toBeVisible();
});

test("movement dropdown is populated with at least 3 exercises from fixture", async ({ page }) => {
  // Bench Press (2 dates), Deadlift (2 dates), Bent Over Row (2 dates) all qualify
  // Pull Up (weight=0) is excluded; each qualifies with ≥2 sessions
  const count = await page.locator("#lift-select option").count();
  expect(count).toBeGreaterThan(2);
});

test("selecting a movement in the dropdown shows stats text", async ({ page }) => {
  // Select the first non-empty option
  const options = page.locator("#lift-select option");
  const firstMovementValue = await options.nth(0).getAttribute("value");
  await page.locator("#lift-select").selectOption(firstMovementValue ?? "");

  // Stats paragraph should be populated
  await expect(page.locator("#lift-stats")).not.toHaveText("");
  await expect(page.locator("#lift-stats")).toContainText("sessions");
});
