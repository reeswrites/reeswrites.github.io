// @ts-check
const { expect } = require("@playwright/test");

/**
 * Replaces the inline BOOKS_OWNED array with fixture data by intercepting books-owned.html.
 * This is a dateless InsightsDashboard page — no time-window presets.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Array} fixture  Array of [author, pages, yearPub, avgRating, firstGenre] tuples
 */
async function injectFixture(page, fixture) {
  await page.route("**/books-owned.html", async (route) => {
    const response = await route.fetch();
    let body = await response.text();
    body = body.replace(
      /const BOOKS_OWNED = \[[\s\S]*?\];/,
      `const BOOKS_OWNED = ${JSON.stringify(fixture)};`,
    );
    await route.fulfill({ response, body });
  });
}

/**
 * Navigate to the books-owned page.
 *
 * @param {import('@playwright/test').Page} page
 */
async function gotoBooksOwned(page) {
  await page.goto("/data/books-owned.html");
}

/**
 * Wait until the insights stats have been populated.
 *
 * @param {import('@playwright/test').Page} page
 */
async function waitForInsights(page) {
  await expect(page.locator("#books-stat-total")).not.toHaveText("—", { timeout: 10_000 });
}

module.exports = { injectFixture, gotoBooksOwned, waitForInsights };
