// @ts-check
const { expect } = require("@playwright/test");
const { rewriteRoute } = require("./route-rewrite");

/**
 * Replaces the inline GAMES array with fixture data by intercepting board-games.html.
 * This is a dateless InsightsDashboard page — no time-window presets.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Array} fixture  Array of [name, type, mechanism[]] tuples
 */
async function injectFixture(page, fixture) {
  await rewriteRoute(page, "**/board-games.html", [
    [/const GAMES = \[[\s\S]*?\];/, `const GAMES = ${JSON.stringify(fixture)};`],
  ]);
}

/**
 * Navigate to the board games page.
 *
 * @param {import('@playwright/test').Page} page
 */
async function gotoGames(page) {
  await page.goto("/inventory/board-games.html");
}

/**
 * Wait until the board games insights stats have been populated.
 *
 * @param {import('@playwright/test').Page} page
 */
async function waitForInsights(page) {
  await expect(page.locator("#games-stat-total")).not.toHaveText("—", { timeout: 10_000 });
}

module.exports = { injectFixture, gotoGames, waitForInsights };
