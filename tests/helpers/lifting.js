// @ts-check
const { expect } = require("@playwright/test");

/**
 * Frozen "today" used by the lifting test suite: June 2, 2026.
 * Fixture has workouts from 2023-2024, so "This year" preset won't match.
 */
const FROZEN_DATE_MS = new Date(2026, 5, 2, 12, 0, 0, 0).getTime();

/**
 * Replaces the inline LIFT_WORKOUTS array with fixture data by intercepting lifting.html.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Array} fixture  Array of {type, date, exercises} workout objects
 */
async function injectFixture(page, fixture) {
  await page.route("**/lifting.html", async (route) => {
    const response = await route.fetch();
    let body = await response.text();
    body = body.replace(
      /const LIFT_WORKOUTS = \[[\s\S]*?\];/,
      `const LIFT_WORKOUTS = ${JSON.stringify(fixture)};`,
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
 * Navigate to the lifting page.
 *
 * @param {import('@playwright/test').Page} page
 */
async function gotoLifting(page) {
  await page.goto("/data/lifting.html");
}

/**
 * Wait until the lifting insights stats have been populated.
 *
 * @param {import('@playwright/test').Page} page
 */
async function waitForInsights(page) {
  await expect(page.locator("#lifting-stat-sessions")).not.toHaveText("—", { timeout: 10_000 });
}

module.exports = { injectFixture, gotoLifting, waitForInsights };
