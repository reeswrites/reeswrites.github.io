// @ts-check
const { expect } = require("@playwright/test");

/**
 * Replaces the inline FRAG_OWN and FRAG_WANT arrays with fixture data.
 * This is a dateless InsightsDashboard page — no time-window presets.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{own: Array, want: Array}} fixture
 */
async function injectFixture(page, fixture) {
  await page.route("**/fragrance.html", async (route) => {
    const response = await route.fetch();
    let body = await response.text();
    body = body.replace(
      /const FRAG_OWN\s*=\s*\[[\s\S]*?\];/,
      `const FRAG_OWN  = ${JSON.stringify(fixture.own)};`,
    );
    body = body.replace(
      /const FRAG_WANT\s*=\s*\[[\s\S]*?\];/,
      `const FRAG_WANT = ${JSON.stringify(fixture.want)};`,
    );
    await route.fulfill({ response, body });
  });
}

/**
 * Navigate to the fragrance page.
 *
 * @param {import('@playwright/test').Page} page
 */
async function gotoFragrance(page) {
  await page.goto("/data/fragrance.html");
}

/**
 * Wait until the fragrance insights stats have been populated.
 *
 * @param {import('@playwright/test').Page} page
 */
async function waitForInsights(page) {
  await expect(page.locator("#frag-stat-own")).not.toHaveText("—", { timeout: 10_000 });
}

module.exports = { injectFixture, gotoFragrance, waitForInsights };
