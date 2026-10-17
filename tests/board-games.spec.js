// @ts-check

/**
 * E2E tests for the /data/board-games page.
 *
 * ── Coverage ──────────────────────────────────────────────────────────────────
 *  1. Tab structure: Insights (default), Table
 *  2. Stats computed from fixture data (dateless dashboard — no time window)
 *  3. Entity toggle: Mechanisms (default), Types
 *  4. Table tab column headers
 *
 * ── Fixture summary (games-data.json) ────────────────────────────────────────
 *  6 games: 3 Card, 3 Board
 *  Mechanisms: Deck Building(1), Deduction(2), Resource Management(2), Route Building(1)
 *  total=6, cardCount=3, boardCount=3, uniqueMechanisms=4, topMechanism="Deduction (2)"
 */

const { test, expect } = require("@playwright/test");
const { exploreBy, expectRanking } = require("./helpers/leaderboard");
const FIXTURE = require("./fixtures/games-data.json");
const { injectFixture, gotoGames, waitForInsights } = require("./helpers/games");

// ── Shared setup ──────────────────────────────────────────────────────────────

test.beforeEach(async ({ page }) => {
  await injectFixture(page, FIXTURE);
  await gotoGames(page);
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
  await expect(page.locator("#games-btn-alltime")).toHaveCount(0);
});

// ── 2. Stats ──────────────────────────────────────────────────────────────────

test("shows correct total game count from fixture", async ({ page }) => {
  await expect(page.locator("#games-stat-total")).toHaveText("6");
});

test("shows correct card and board game counts from fixture", async ({ page }) => {
  await expect(page.locator("#games-stat-card")).toHaveText("3");
  await expect(page.locator("#games-stat-board")).toHaveText("3");
});

test("shows correct unique mechanism count from fixture", async ({ page }) => {
  await expect(page.locator("#games-stat-mechs")).toHaveText("4");
});

test("shows correct top mechanism from fixture", async ({ page }) => {
  // Deduction has count=2, first mechanism to reach topCount
  await expect(page.locator("#games-stat-topmech")).toHaveText("Deduction (2)");
});

// ── 3. Entity toggle ──────────────────────────────────────────────────────────

test("leaderboard explores by mechanism by default, Deduction and Resource Management tied on top", async ({
  page,
}) => {
  await expect(exploreBy(page)).toHaveValue("mechanisms");
  // Deduction(2) and Resource Management(2) tie for the lead
  await expectRanking(page.locator("#games-top-list .fw-semibold"), [
    ["Deduction", "Resource Management"],
  ]);
});

test("types entity puts Card and Board tied on top", async ({ page }) => {
  await exploreBy(page).selectOption("types");
  // Card and Board both have count=3
  await expectRanking(page.locator("#games-top-list .fw-semibold"), [["Card", "Board"]]);
});

test("switching entities back and forth swaps the leaderboard", async ({ page }) => {
  const labels = page.locator("#games-top-list .fw-semibold");
  await exploreBy(page).selectOption("types");
  await expectRanking(labels, [["Card", "Board"]]);

  await exploreBy(page).selectOption("mechanisms");
  await expectRanking(labels, [["Deduction", "Resource Management"]]);
});

// ── 4. Table tab ──────────────────────────────────────────────────────────────

test("table tab shows correct column headers", async ({ page }) => {
  await page.locator("#table-tab").click();
  await expect(page.locator("#table-tab-pane")).toBeVisible();

  const headers = page.locator("#myTable thead th");
  await expect(headers.nth(0)).toContainText("Name");
  await expect(headers.nth(1)).toContainText("Type");
  await expect(headers.nth(2)).toContainText("Mechanism");
});
