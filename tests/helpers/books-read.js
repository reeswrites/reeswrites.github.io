// @ts-check
const { expect } = require("@playwright/test");

/**
 * Replaces the inline BOOKS array with fixture data by intercepting books-read.html.
 * roughViz is loaded from CDN, so stats only render after it evaluates.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Array} fixture  Array of {a, r, p, y} objects
 */
async function injectFixture(page, fixture) {
  await page.route("**/books-read.html", async (route) => {
    const response = await route.fetch();
    let body = await response.text();
    body = body.replace(
      /const BOOKS = \[[\s\S]*?\];/,
      `const BOOKS = ${JSON.stringify(fixture)};`,
    );
    await route.fulfill({ response, body });
  });
}

/**
 * Navigate to the books-read page.
 *
 * @param {import('@playwright/test').Page} page
 */
async function gotoBooksRead(page) {
  await page.goto("/data/books-read.html");
}

/**
 * Wait until the insights stats have been populated.
 * Stats render synchronously once roughViz is available (DOMContentLoaded hook).
 *
 * @param {import('@playwright/test').Page} page
 */
async function waitForInsights(page) {
  await expect(page.locator("#stat-total-books")).not.toHaveText("—", { timeout: 12_000 });
}

module.exports = { injectFixture, gotoBooksRead, waitForInsights };
