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
const { exploreBy, expectRanking } = require("./helpers/leaderboard");
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

test("leaderboard explores by session type by default, Push and Pull tied", async ({ page }) => {
  await expect(exploreBy(page)).toHaveValue("types");

  // Two push and two pull sessions
  const labels = page.locator("#lifting-top-list .fw-semibold");
  await expect(labels).toHaveCount(2);
  await expectRanking(labels, [["Push", "Pull"]]);
});

test("movements entity ranks movements by total reps", async ({ page }) => {
  await exploreBy(page).selectOption("movements");

  // Fixture reps per movement: Bench Press 28+32=60, Bent Over Row 58,
  // Pull Up 45, Deadlift 29, Overhead Press 22
  const labels = page.locator("#lifting-top-list .fw-semibold");
  await expect(labels).toHaveCount(5);
  await expect(labels.first()).toHaveText("Bench Press");
});

test("muscles entity ranks target muscles by total reps", async ({ page }) => {
  await exploreBy(page).selectOption("muscles");

  // Fixture via the muscle map: shoulders = bench 60 + overhead 22 = 82,
  // triceps also 82 (shoulders is reached first, so it leads the tie),
  // chest 60, then the row's muscles at 58. Deadlift and Pull Up map to none.
  await expect(page.locator("#lifting-top-list .fw-semibold").first()).toHaveText(/shoulders/i);
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
