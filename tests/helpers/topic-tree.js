// @ts-check
const { expect } = require("@playwright/test");

/**
 * Injects the frozen fixture into the page BEFORE any page scripts run.
 * Locks window.TOPIC_TREE_DATA as non-writable so Jekyll's inline Liquid
 * assignment (`window.TOPIC_TREE_DATA = {{ site.data.topics | jsonify }}`)
 * silently no-ops, and the fixture wins.
 *
 * Call this before page.goto().
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} fixture  - The topic tree data fixture object
 */
async function injectFixture(page, fixture) {
  await page.addInitScript((data) => {
    // Lock TOPIC_TREE_DATA: Jekyll's non-strict inline assignment will silently no-op.
    Object.defineProperty(window, "TOPIC_TREE_DATA", {
      value: data,
      writable: false,
      configurable: false,
    });
  }, fixture);
}

/**
 * Waits until the topic tree is fully initialised:
 * at least one .tt-card is rendered in #tt-children.
 *
 * @param {import('@playwright/test').Page} page
 */
async function waitForTreeReady(page) {
  await expect(page.locator("#tt-children .tt-card")).toHaveCount(
    expect.any(Number),
    { timeout: 5_000 },
  );
  // Ensure at least 1 card exists
  await expect(page.locator("#tt-children .tt-card").first()).toBeVisible({
    timeout: 5_000,
  });
}

module.exports = { injectFixture, waitForTreeReady };
