// @ts-check
const { expect } = require("@playwright/test");

/**
 * Frozen "today" used by the listening test suite: June 2, 2026.
 *
 * Chosen to match the scrobbles-data.json fixture's last_updated date and to
 * place "This year" at 2026 (fixture has one week: 2026-01-05) and
 * "Last 12 months" covering weeks from 2025-06-03 onward (fixture weeks:
 * 2025-07-07 and 2026-01-05 → 11 plays).
 */
const FROZEN_DATE_MS = new Date(2026, 5, 2, 12, 0, 0, 0).getTime(); // June 2, 2026

/**
 * Injects the frozen scrobbles fixture into the page before any page scripts run.
 *
 * - Shims window.fetch so requests for scrobbles.json resolve instantly with the
 *   fixture (more reliable than page.route() for same-origin fetch calls in tests).
 * - Freezes Date so preset buttons (This Year, Last 12 Months) are deterministic.
 *
 * Call this before page.goto().
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} fixture  The scrobbles fixture object
 */
async function injectFixture(page, fixture) {
  await page.addInitScript(
    ({ data, frozenMs }) => {
      // ── Shim fetch for scrobbles.json ────────────────────────────────────────
      const _fetch = window.fetch.bind(window);
      window.fetch = function (url, ...args) {
        if (typeof url === "string" && url.includes("/static/data/scrobbles.json")) {
          return Promise.resolve(
            new Response(JSON.stringify(data), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
          );
        }
        return _fetch(url, ...args);
      };

      // ── Freeze Date ──────────────────────────────────────────────────────────
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
    { data: fixture, frozenMs: FROZEN_DATE_MS },
  );
}

/**
 * Navigate to the listening data page.
 *
 * @param {import('@playwright/test').Page} page
 */
async function gotoListening(page) {
  // Python's http.server doesn't serve listening.html at /data/listening (no .html extension),
  // so use the explicit .html URL that Python can find in _site/data/.
  await page.goto("/data/listening.html");
}

/**
 * Wait until the insights dashboard is fully loaded and visible.
 * The loading indicator disappears once the fetch resolves.
 *
 * @param {import('@playwright/test').Page} page
 */
async function waitForInsights(page) {
  await expect(page.locator("#insights-content")).toBeVisible({ timeout: 10_000 });
}

module.exports = { injectFixture, gotoListening, waitForInsights };
