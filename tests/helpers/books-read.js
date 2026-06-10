// @ts-check
const { expect } = require("@playwright/test");

/**
 * Replaces the INSIGHTS_DATASETS["books_read"].rows with fixture data by intercepting
 * books-read.html. BOOK_MODAL_ITEMS is left intact so DataModal continues to work
 * with real Liquid-rendered book data.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Array} fixture  Array of {title, author, genres, rating, pages, year, decade} objects
 */
async function injectFixture(page, fixture) {
  await page.route("**/books-read.html", async (route) => {
    const response = await route.fetch();
    let body = await response.text();
    body = body.replace(
      /rows: BOOK_MODAL_ITEMS\.map\([\s\S]*?\n        fields:/,
      `rows: ${JSON.stringify(fixture)},\n        fields:`,
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
 *
 * @param {import('@playwright/test').Page} page
 */
async function waitForInsights(page) {
  await expect(page.locator("#booksread-stat-total")).not.toHaveText("—", { timeout: 12_000 });
}

module.exports = { injectFixture, gotoBooksRead, waitForInsights };
