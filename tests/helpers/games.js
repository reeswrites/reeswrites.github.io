// @ts-check
const { expect } = require("@playwright/test");

/**
 * Replaces the inline GAMES array with fixture data by intercepting board-games.html.
 * This is a dateless InsightsDashboard page — no time-window presets.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Array} fixture  Array of [name, type, mechanism[]] tuples
 */
async function injectFixture(page, fixture) {
  await page.route("**/board-games.html", async (route) => {
    const response = await route.fetch();
    let body = await response.text();
    body = body.replace(/const GAMES = \[[\s\S]*?\];/, `const GAMES = ${JSON.stringify(fixture)};`);
    await route.fulfill({ response, body });
  });
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
