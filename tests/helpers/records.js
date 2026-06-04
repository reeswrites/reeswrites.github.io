// @ts-check
const { expect } = require("@playwright/test");

/**
 * Frozen "today" used by the records test suite: June 2, 2026.
 * Fixture has records from 2022-2024, so "This year" and "Last 12 months"
 * presets won't match any data (lo === -1) — tested via year buttons only.
 */
const FROZEN_DATE_MS = new Date(2026, 5, 2, 12, 0, 0, 0).getTime();

/**
 * Replaces the inline RECORDS array with fixture data by intercepting records.html.
 * Date is frozen so time-window highlights are deterministic.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Array} fixture  Array of [album, artist, releaseYear, datePurchased, genre] tuples
 */
async function injectFixture(page, fixture) {
  await page.route("**/records.html", async (route) => {
    const response = await route.fetch();
    let body = await response.text();
    body = body.replace(
      /const RECORDS = \[[\s\S]*?\];/,
      `const RECORDS = ${JSON.stringify(fixture)};`,
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
 * Navigate to the records page.
 *
 * @param {import('@playwright/test').Page} page
 */
async function gotoRecords(page) {
  await page.goto("/data/records.html");
}

/**
 * Wait until the records insights stats have been populated.
 *
 * @param {import('@playwright/test').Page} page
 */
async function waitForInsights(page) {
  await expect(page.locator("#records-stat-total")).not.toHaveText("—", { timeout: 10_000 });
}

module.exports = { injectFixture, gotoRecords, waitForInsights };
