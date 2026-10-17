// @ts-check
const { expect } = require("@playwright/test");
const { rewritePageData } = require("./page-data");

/**
 * Replaces the BOOKS_OWNED array with fixture data by intercepting the page's
 * data file (static/data/pages/books-owned.js).
 *
 * @param {import('@playwright/test').Page} page
 * @param {Array} fixture  Array of [author, pages, yearPub, avgRating, firstGenre] tuples
 */
async function injectFixture(page, fixture) {
  await rewritePageData(page, "books-owned", [
    [/const BOOKS_OWNED = \[[\s\S]*?\];/, `const BOOKS_OWNED = ${JSON.stringify(fixture)};`],
  ]);
}

/**
 * Navigate to the books-owned page.
 *
 * @param {import('@playwright/test').Page} page
 */
async function gotoBooksOwned(page) {
  await page.goto("/inventory/books-owned.html");
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
