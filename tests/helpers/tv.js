// @ts-check
const { expect } = require("@playwright/test");

/**
 * Replaces the inline TV_SHOWS array with fixture data by intercepting tv.html.
 * Stats and leaderboard are rendered synchronously on script evaluation.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Array} fixture  Array of [title, year, malScore, eps, genres, countries, runtime] tuples
 */
async function injectFixture(page, fixture) {
  await page.route("**/tv.html", async (route) => {
    const response = await route.fetch();
    let body = await response.text();
    body = body.replace(
      /const TV_SHOWS = \[[\s\S]*?\];/,
      `const TV_SHOWS = ${JSON.stringify(fixture)};`,
    );
    await route.fulfill({ response, body });
  });
}

/**
 * Navigate to the TV page.
 *
 * @param {import('@playwright/test').Page} page
 */
async function gotoTV(page) {
  await page.goto("/data/tv.html");
}

/**
 * Wait until the TV insights stats have been populated.
 * Stats are set synchronously, so they are ready once the page load event fires.
 *
 * @param {import('@playwright/test').Page} page
 */
async function waitForInsights(page) {
  await expect(page.locator("#tv-stat-shows")).not.toHaveText("—", { timeout: 10_000 });
}

module.exports = { injectFixture, gotoTV, waitForInsights };
