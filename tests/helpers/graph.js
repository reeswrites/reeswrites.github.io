// @ts-check
const { expect } = require("@playwright/test");

/**
 * Injects the frozen fixture into the page BEFORE any page scripts run.
 * Locks window.GRAPH_DATA as non-writable so Jekyll's inline Liquid assignment
 * (`window.GRAPH_DATA = {{ site.data.graph | jsonify }}`) silently no-ops, and
 * seeds Math.random with a fixed LCG for deterministic force-simulation positions.
 *
 * Call this before page.goto().
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} fixture  - The graph data fixture object
 */
async function injectFixture(page, fixture) {
  await page.addInitScript((data) => {
    // Lock GRAPH_DATA: Jekyll's non-strict inline assignment will silently no-op.
    Object.defineProperty(window, "GRAPH_DATA", {
      value: data,
      writable: false,
      configurable: false,
    });

    // Seed Math.random so D3 force-simulation initial positions are deterministic.
    let seed = 42;
    Math.random = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
  }, fixture);
}

/**
 * Waits until the graph is fully initialised:
 *   - loading overlay has been removed from the layout (display:none after 420ms)
 *   - the expected number of node circles are present in the SVG
 *
 * Does NOT wait for the 2800ms delayed fitView re-run — that only affects
 * zoom, not the data-driven state we characterise.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} expectedNodeCount
 */
async function waitForGraphReady(page, expectedNodeCount) {
  // Wait directly for node circles — the fixture is injected before page load
  // so circles are stable once D3 renders them. Skipping the 420ms overlay
  // timeout that the app uses for its fade animation.
  await expect(page.locator("#graph-svg circle.nn")).toHaveCount(expectedNodeCount, {
    timeout: 10_000,
  });
}

/**
 * Returns the viewport-space centre {x, y} of the SVG circle whose D3 datum
 * has the given node id.  Throws if no such circle is found.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} nodeId
 * @returns {Promise<{x: number, y: number}>}
 */
async function getNodeCenter(page, nodeId) {
  const center = await page.evaluate((id) => {
    const circle = [...document.querySelectorAll("#graph-svg circle.nn")].find(
      (el) => /** @type {any} */ (el).__data__?.id === id,
    );
    if (!circle) throw new Error(`No circle found for node id: ${id}`);
    const r = circle.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, nodeId);
  return center;
}

/**
 * Clicks a node circle identified by its D3 datum id.
 * Single-click: sidebar opens after the 250ms disambiguation timer.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} nodeId
 */
async function clickNode(page, nodeId) {
  const { x, y } = await getNodeCenter(page, nodeId);
  await page.mouse.click(x, y);
}

/**
 * Double-clicks a node (two rapid clicks within 250ms).
 * Triggers the "zoom to neighbourhood" branch in onNodeClick.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} nodeId
 */
async function doubleClickNode(page, nodeId) {
  const { x, y } = await getNodeCenter(page, nodeId);
  await page.mouse.dblclick(x, y);
}

/**
 * Hovers over a node circle, triggering the tooltip.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} nodeId
 */
async function hoverNode(page, nodeId) {
  const { x, y } = await getNodeCenter(page, nodeId);
  await page.mouse.move(x, y);
}

/**
 * Reads the fill attribute of every node circle and returns a Map of
 * nodeId → fill string.  Useful for asserting search-dimming colours.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Map<string, string>>}
 */
async function getNodeFills(page) {
  const pairs = await page.evaluate(() =>
    [...document.querySelectorAll("#graph-svg circle.nn")].map((el) => [
      /** @type {any} */ (el).__data__?.id,
      el.getAttribute("fill"),
    ]),
  );
  return new Map(pairs);
}

module.exports = {
  injectFixture,
  waitForGraphReady,
  getNodeCenter,
  clickNode,
  doubleClickNode,
  hoverNode,
  getNodeFills,
};
