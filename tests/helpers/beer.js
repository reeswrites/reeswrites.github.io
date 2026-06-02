// @ts-check
const { expect } = require("@playwright/test");

/**
 * Frozen "today" used by the beer test suite: June 2, 2026.
 *
 * Chosen so that:
 *   Last 30 days  → ≥ 2026-05-03 → week 2026-05-25 (1 checkin)
 *   Last 12 months → ≥ 2025-06-02 → weeks 2025-06-30, 2025-10-13, 2026-01-19, 2026-05-25 (4 checkins)
 */
const FROZEN_DATE_MS = new Date(2026, 5, 2, 12, 0, 0, 0).getTime(); // June 2, 2026

/**
 * Injects a controlled CHECKINS fixture into the beer page.
 *
 * Because beer data is embedded inline via Liquid (not fetched), we intercept
 * the served beer.html and replace the CHECKINS array with the fixture before
 * the browser parses the page.  Date is also frozen so preset buttons are
 * deterministic.
 *
 * Call before page.goto().
 *
 * @param {import('@playwright/test').Page} page
 * @param {Array} fixture  Array of [style, brewery, name, rating, date] tuples
 */
async function injectFixture(page, fixture) {
  await page.route("**/beer.html", async (route) => {
    const response = await route.fetch();
    let body = await response.text();
    body = body.replace(
      /const CHECKINS = \[[\s\S]*?\];/,
      `const CHECKINS = ${JSON.stringify(fixture)};`,
    );
    await route.fulfill({ response, body });
  });

  await page.addInitScript(
    ({ frozenMs }) => {
      const _Date = Date;
      function FrozenDate(...args) {
        return args.length === 0 ? new _Date(frozenMs) : new _Date(...args);
      }
      FrozenDate.prototype = _Date.prototype;
      FrozenDate.now = () => frozenMs;
      FrozenDate.parse = _Date.parse.bind(_Date);
      FrozenDate.UTC = _Date.UTC.bind(_Date);
      Object.setPrototypeOf(FrozenDate, _Date);
      window.Date = FrozenDate;
    },
    { frozenMs: FROZEN_DATE_MS },
  );
}

/**
 * Navigate to the beer data page.
 *
 * @param {import('@playwright/test').Page} page
 */
async function gotoBeer(page) {
  await page.goto("/data/beer.html");
}

/**
 * Wait until the insights dashboard is populated.
 * beerInit() runs synchronously, so the stats are ready as soon as scripts execute.
 *
 * @param {import('@playwright/test').Page} page
 */
async function waitForInsights(page) {
  await expect(page.locator("#beer-stat-beers")).not.toHaveText("—", { timeout: 10_000 });
}

module.exports = { injectFixture, gotoBeer, waitForInsights };
