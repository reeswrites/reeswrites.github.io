// @ts-check

/**
 * Characterization tests for the graph view (/posts/graph/).
 *
 * These tests lock in the CURRENT behaviour of the D3 force-graph page so that
 * any silent regression introduced during refactoring or feature work shows up
 * as a test failure.  They are "golden-master" tests: the expected values below
 * were captured from the real page running against the frozen fixture.
 *
 * ── Determinism strategy ─────────────────────────────────────────────────────
 * The page is served from a real Jekyll build (_site/), which inlines all
 * 314 nodes from _data/graph.json via Liquid.  Before navigation, injectFixture()
 * replaces window.GRAPH_DATA with a small frozen 12-node subset and seeds
 * Math.random with a fixed LCG, making force-simulation initial positions
 * deterministic.  Assertions target data-driven DOM state (counts, text,
 * classes, fill attributes) — not pixel coordinates, which vary with physics.
 *
 * ── Fixture summary ──────────────────────────────────────────────────────────
 *  12 nodes  (1 fully isolated: 2018-04-29-Hack-Check)
 *  13 backlink edges
 *  12 semantic edges
 *
 *  Legend golden values (connected / unconnected):
 *    BL + SE both on  →  11 / 1
 *    BL only          →  11 / 1
 *    SE only          →   9 / 3
 *    Both off         →   0 / 12
 */

const { test, expect } = require("@playwright/test");
const FIXTURE = require("./fixtures/graph-data.json");
const {
  injectFixture,
  waitForGraphReady,
  clickNode,
  doubleClickNode,
  hoverNode,
  getNodeFills,
} = require("./helpers/graph");
const NODE_COUNT = FIXTURE.nodes.length; // 12

// ── Shared setup ──────────────────────────────────────────────────────────────

test.beforeEach(async ({ page }) => {
  await injectFixture(page, FIXTURE);
  await page.goto("/posts/graph/");
  await waitForGraphReady(page, NODE_COUNT);
});

// ── 1. Page load & initial structure ─────────────────────────────────────────

test("renders all fixture nodes and shows initial controls", async ({ page }) => {
  // All 12 fixture nodes rendered as SVG circles
  await expect(page.locator("#graph-svg circle.nn")).toHaveCount(NODE_COUNT);

  // Loading overlay gone: .hidden class is added synchronously (opacity→0),
  // then display:none is set after 420ms. Check the class since Bootstrap's
  // d-flex uses !important and overrides the inline display:none at computed level.
  await expect(page.locator("#graph-loading")).toHaveClass(/hidden/);

  // Both edge-type checkboxes start checked (default state)
  await expect(page.locator("#chk-backlinks")).toBeChecked();
  await expect(page.locator("#chk-semantic")).toBeChecked();

  // Sidebar starts closed (no .open class)
  await expect(page.locator("#graph-sidebar")).not.toHaveClass(/open/);

  // Controls bar visible
  await expect(page.locator("#graph-controls")).toBeVisible();
  await expect(page.locator("#graph-search")).toBeVisible();
  await expect(page.locator("#btn-fit")).toBeVisible();
  await expect(page.locator("#btn-help")).toBeVisible();
});

// ── 2. Legend counts per filter combination ───────────────────────────────────

test("legend connected/unconnected counts: both on → 11/1", async ({ page }) => {
  // Both BL and SE on by default.  11 of 12 nodes have at least one edge.
  await expect(page.locator("#legend-connected-cnt")).toHaveText("(11)");
  await expect(page.locator("#legend-unconnected-cnt")).toHaveText("(1)");
});

test("legend counts: BL only → 11/1", async ({ page }) => {
  await page.locator("#chk-semantic").uncheck();
  // All BL-connected nodes are still connected; isolated node stays unconnected.
  await expect(page.locator("#legend-connected-cnt")).toHaveText("(11)");
  await expect(page.locator("#legend-unconnected-cnt")).toHaveText("(1)");
});

test("legend counts: SE only → 9/3", async ({ page }) => {
  await page.locator("#chk-backlinks").uncheck();
  // dmv-beer-spots, places-to-visit-philly, Hack-Check have no SE edges.
  await expect(page.locator("#legend-connected-cnt")).toHaveText("(9)");
  await expect(page.locator("#legend-unconnected-cnt")).toHaveText("(3)");
});

test("legend counts: both off → 0/12", async ({ page }) => {
  await page.locator("#chk-backlinks").uncheck();
  await page.locator("#chk-semantic").uncheck();
  await expect(page.locator("#legend-connected-cnt")).toHaveText("(0)");
  await expect(page.locator("#legend-unconnected-cnt")).toHaveText("(12)");
});

// ── 3. Sidebar — fully connected hub node (1000-beers) ───────────────────────

test("sidebar shows correct metadata for hub node", async ({ page }) => {
  // 1000-beers: in_bl=[favorite-brewery-deciding], out_bl=6 nodes, se_nbrs=5 nodes
  await clickNode(page, "1000-beers");

  // Sidebar opens
  await expect(page.locator("#graph-sidebar")).toHaveClass(/open/);

  // Title and date
  await expect(page.locator("#sb-title")).toHaveText("I Drank 1,000 Beers!");
  await expect(page.locator("#sb-date")).toHaveText("2023-12-17");

  // Tags (rendered as badge links)
  const tags = page.locator("#sb-tags .badge");
  await expect(tags).toHaveCount(2);
  await expect(tags.nth(0)).toHaveText("Beer");
  await expect(tags.nth(1)).toHaveText("2023");

  // Description
  await expect(page.locator("#sb-desc")).toHaveText(
    "Analyzing my Untappd data after trying 1,000 unique beers.",
  );

  // "Open post" link href
  await expect(page.locator("#sb-link")).toHaveAttribute("href", "/posts/1000-beers");
});

test("sidebar shows correct edge counts for hub node", async ({ page }) => {
  await clickNode(page, "1000-beers");
  await expect(page.locator("#graph-sidebar")).toHaveClass(/open/);

  // Linked From (inbound backlinks): 1 — favorite-brewery-deciding
  await expect(page.locator("#sb-bl-cnt")).toHaveText("(1)");

  // Links To (outbound backlinks): 6
  await expect(page.locator("#sb-ol-cnt")).toHaveText("(6)");

  // Semantically similar: 5
  await expect(page.locator("#sb-se-cnt")).toHaveText("(5)");
});

test("sidebar shows correct neighbour lists for hub node", async ({ page }) => {
  await clickNode(page, "1000-beers");
  await expect(page.locator("#graph-sidebar")).toHaveClass(/open/);

  // Linked From: one button — the node that links TO 1000-beers
  const blButtons = page.locator("#sb-backlinks .nbr-btn");
  await expect(blButtons).toHaveCount(1);
  await expect(blButtons.first()).toHaveText("How do I decide my favorite breweries?");

  // Links To: six buttons (nodes 1000-beers links OUT to)
  const olButtons = page.locator("#sb-outlinks .nbr-btn");
  await expect(olButtons).toHaveCount(6);
  const olTitles = await olButtons.allTextContents();
  expect(olTitles).toContain("Why I Log Every Beer That I Drink"); // beer-ratings
  expect(olTitles).toContain("How To Buy Beer Like A Nerd"); // buying-beer-like-a-nerd
  expect(olTitles).toContain("My Favorite Breweries"); // favorite-breweries
  expect(olTitles).toContain("How to Get Into Beer"); // getting-into-beer
  expect(olTitles).toContain("How to Try More Beer"); // how-to-try-more-beer
  expect(olTitles).toContain("Why Get Into Beer?"); // why-get-into-beer

  // Semantically similar: five buttons
  const seButtons = page.locator("#sb-semantic .nbr-btn");
  await expect(seButtons).toHaveCount(5);
  const seTitles = await seButtons.allTextContents();
  expect(seTitles).toContain("Why I Log Every Beer That I Drink"); // beer-ratings
  expect(seTitles).toContain("Evolving as a Beer Drinker"); // evolving-as-a-beer-drinker
  expect(seTitles).toContain("How to Get Into Beer"); // getting-into-beer
  expect(seTitles).toContain("How to Try More Beer"); // how-to-try-more-beer
  expect(seTitles).toContain("Why Get Into Beer?"); // why-get-into-beer
});

// ── 4. Sidebar — multi-tag node ───────────────────────────────────────────────

test("sidebar renders all tags for a multi-tag node", async ({ page }) => {
  // favorite-breweries has 3 tags: Food/Beverage, Beer, 2023
  await clickNode(page, "favorite-breweries");
  await expect(page.locator("#graph-sidebar")).toHaveClass(/open/);

  const tags = page.locator("#sb-tags .badge");
  await expect(tags).toHaveCount(3);
  await expect(tags.nth(0)).toHaveText("Food/Beverage");
  await expect(tags.nth(1)).toHaveText("Beer");
  await expect(tags.nth(2)).toHaveText("2023");
});

// ── 5. Sidebar — node with no date ───────────────────────────────────────────

test("sidebar shows empty date for node with no date field", async ({ page }) => {
  // buying-beer-like-a-nerd has date: ""
  await clickNode(page, "buying-beer-like-a-nerd");
  await expect(page.locator("#graph-sidebar")).toHaveClass(/open/);
  await expect(page.locator("#sb-date")).toHaveText("");
});

// ── 6. Sidebar — isolated node ────────────────────────────────────────────────

test("sidebar shows zero counts and None lists for isolated node", async ({ page }) => {
  // 2018-04-29-Hack-Check has no edges of any kind.
  await clickNode(page, "2018-04-29-Hack-Check");
  await expect(page.locator("#graph-sidebar")).toHaveClass(/open/);

  await expect(page.locator("#sb-title")).toHaveText("Hack Check");

  // All three counts are zero
  await expect(page.locator("#sb-bl-cnt")).toHaveText("(0)");
  await expect(page.locator("#sb-ol-cnt")).toHaveText("(0)");
  await expect(page.locator("#sb-se-cnt")).toHaveText("(0)");

  // Each section shows the "None" placeholder
  await expect(page.locator("#sb-backlinks")).toHaveText("None");
  await expect(page.locator("#sb-outlinks")).toHaveText("None");
  await expect(page.locator("#sb-semantic")).toHaveText("None");
});

// ── 7. Neighbour navigation ───────────────────────────────────────────────────

test("clicking a neighbour button in the sidebar loads that node", async ({ page }) => {
  // Open 1000-beers sidebar; "Linked From" has one button: favorite-brewery-deciding
  await clickNode(page, "1000-beers");
  await expect(page.locator("#graph-sidebar")).toHaveClass(/open/);
  await expect(page.locator("#sb-title")).toHaveText("I Drank 1,000 Beers!");

  // Click the neighbour button for the inbound link
  await page.locator("#sb-backlinks .nbr-btn").first().click();

  // Sidebar now shows favorite-brewery-deciding
  await expect(page.locator("#sb-title")).toHaveText("How do I decide my favorite breweries?");

  // favorite-brewery-deciding: in_bl=0, out_bl=2 (1000-beers + favorite-breweries), se=1 (favorite-breweries)
  await expect(page.locator("#sb-bl-cnt")).toHaveText("(0)");
  await expect(page.locator("#sb-ol-cnt")).toHaveText("(2)");
  await expect(page.locator("#sb-se-cnt")).toHaveText("(1)");

  // Linked From → None
  await expect(page.locator("#sb-backlinks")).toHaveText("None");
});

// ── 8. Search dimming ─────────────────────────────────────────────────────────

test("search highlights matching nodes and dims non-matching nodes", async ({ page }) => {
  // "DMV" matches only "Cool Beer Spots in the DMV" (dmv-beer-spots).
  // Use pressSequentially (not fill) so Playwright dispatches proper input events
  // without triggering any native search-input clear/submit behaviour.
  await page.locator("#graph-search").click();
  await page.locator("#graph-search").pressSequentially("DMV");

  // Wait comfortably past the 120ms debounce + synchronous renderFrame.
  await page.waitForTimeout(300);

  const fills = await getNodeFills(page);

  // Matching node gets search-highlight colour (COL_NODE_SEARCH = "#e8c36a")
  expect(fills.get("dmv-beer-spots")).toBe("#e8c36a");

  // Non-matching nodes get dim colour (COL_NODE_DIM = "rgba(74,144,184,0.15)")
  expect(fills.get("1000-beers")).toBe("rgba(74,144,184,0.15)");
  expect(fills.get("beer-ratings")).toBe("rgba(74,144,184,0.15)");
  expect(fills.get("2018-04-29-Hack-Check")).toBe("rgba(74,144,184,0.15)");
});

test("clearing search restores normal node colours", async ({ page }) => {
  // Apply search, then clear it.
  await page.locator("#graph-search").click();
  await page.locator("#graph-search").pressSequentially("DMV");
  await page.waitForTimeout(300);

  await page.locator("#graph-search").clear();
  // Wait past the 120ms debounce for the search clear to take effect.
  await page.waitForTimeout(300);

  const fills = await getNodeFills(page);
  // Isolated node (Hack-Check) has no active edges → still gets COL_NODE_DIM at rest
  // but that is its normal non-search state too, so we just confirm the search node
  // is no longer highlighted.
  expect(fills.get("dmv-beer-spots")).not.toBe("#e8c36a");
});

// ── 9. Hover tooltip ─────────────────────────────────────────────────────────

test("hovering a node shows tooltip with title", async ({ page }) => {
  await hoverNode(page, "why-get-into-beer");

  // Tooltip becomes visible and contains the node title
  await expect(page.locator("#graph-tooltip")).toHaveClass(/visible/);
  await expect(page.locator("#graph-tooltip")).toContainText("Why Get Into Beer?");
});

test("hovering a node with a date shows the date in the tooltip", async ({ page }) => {
  await hoverNode(page, "why-get-into-beer");
  await expect(page.locator("#graph-tooltip")).toHaveClass(/visible/);
  await expect(page.locator("#graph-tooltip .tt-date")).toHaveText("2023-10-24");
});

// ── 10. Help modal ────────────────────────────────────────────────────────────

test("help button opens modal and close button dismisses it", async ({ page }) => {
  // Modal starts hidden
  await expect(page.locator("#graph-help-modal")).not.toHaveClass(/show/);

  // Open via button
  await page.locator("#btn-help").click();
  await expect(page.locator("#graph-help-modal")).toHaveClass(/show/);
  await expect(page.locator("#graph-help-modal-label")).toHaveText("How to use the graph");

  // Close via the × button inside the modal
  await page.locator("#graph-help-close").click();
  await expect(page.locator("#graph-help-modal")).not.toHaveClass(/show/);
});

// ── 11. Deselect behaviours ───────────────────────────────────────────────────

test("Escape key closes the sidebar and deselects node", async ({ page }) => {
  await clickNode(page, "1000-beers");
  await expect(page.locator("#graph-sidebar")).toHaveClass(/open/);

  await page.keyboard.press("Escape");
  await expect(page.locator("#graph-sidebar")).not.toHaveClass(/open/);
});

test("close button in sidebar closes the sidebar", async ({ page }) => {
  await clickNode(page, "1000-beers");
  await expect(page.locator("#graph-sidebar")).toHaveClass(/open/);

  await page.locator("#sb-close").click();
  await expect(page.locator("#graph-sidebar")).not.toHaveClass(/open/);
});

test("clicking the SVG background deselects and closes the sidebar", async ({ page }) => {
  await clickNode(page, "1000-beers");
  await expect(page.locator("#graph-sidebar")).toHaveClass(/open/);

  // Dispatch a click directly on the SVG element (not on a node circle).
  // Node circles call event.stopPropagation(), so a direct SVG click targets
  // only the background handler: svg.on("click", () => { selectedId = null; closeSidebar(); })
  // SVGElement doesn't have .click() — use dispatchEvent instead.
  await page.evaluate(() => {
    document
      .getElementById("graph-svg")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: false, cancelable: true }));
  });

  await expect(page.locator("#graph-sidebar")).not.toHaveClass(/open/);
});

// ── 12. Semantic-only layout smoke test ───────────────────────────────────────

test("switching to semantic-only layout updates legend and keeps nodes visible", async ({
  page,
}) => {
  // Uncheck backlinks → SE-only UMAP layout (simulation freezes, nodes tween to umap coords)
  await page.locator("#chk-backlinks").uncheck();

  // Legend reflects SE-only connectivity
  await expect(page.locator("#legend-connected-cnt")).toHaveText("(9)");
  await expect(page.locator("#legend-unconnected-cnt")).toHaveText("(3)");

  // All nodes still visible after layout switch
  await expect(page.locator("#graph-svg circle.nn")).toHaveCount(NODE_COUNT);

  // No JS errors thrown (the page should remain interactive)
  await expect(page.locator("#graph-search")).toBeEnabled();
});

// ── 13. Double-click zoom-to-neighbourhood ────────────────────────────────────

test("double-clicking a node opens the sidebar and changes the zoom transform", async ({
  page,
}) => {
  // Capture transform before interaction
  const initialTransform = await page.evaluate(() =>
    document.querySelector("#graph-svg g")?.getAttribute("transform"),
  );

  await doubleClickNode(page, "1000-beers");

  // Double-click selects and opens sidebar (same path as single-click)
  await expect(page.locator("#graph-sidebar")).toHaveClass(/open/);
  await expect(page.locator("#sb-title")).toHaveText("I Drank 1,000 Beers!");

  // Wait for the 450ms zoom transition to complete, then verify transform changed
  await page.waitForTimeout(500);
  const newTransform = await page.evaluate(() =>
    document.querySelector("#graph-svg g")?.getAttribute("transform"),
  );
  expect(newTransform).not.toBe(initialTransform);
});

// ── 14. Filter-aware neighbour highlighting ───────────────────────────────────

test("disabling SE edges removes SE-only neighbours from hover highlight", async ({ page }) => {
  // evolving-as-a-beer-drinker is a SE-only neighbour of 1000-beers (no BL edge exists)
  // With SE off, hovering 1000-beers must NOT highlight it.
  await page.locator("#chk-semantic").uncheck();

  await hoverNode(page, "1000-beers");
  await page.waitForTimeout(100);

  const fills = await getNodeFills(page);

  // SE-only neighbour must be dimmed when SE edges are hidden
  expect(fills.get("evolving-as-a-beer-drinker")).toBe("rgba(74,144,184,0.15)");

  // beer-ratings is a BL outlink of 1000-beers so it stays highlighted
  expect(fills.get("beer-ratings")).not.toBe("rgba(74,144,184,0.15)");
});

test("disabling BL edges removes BL-only neighbours from hover highlight", async ({ page }) => {
  // buying-beer-like-a-nerd is a BL outlink of 1000-beers but NOT a SE neighbour.
  // With BL off, hovering 1000-beers must NOT highlight it.
  await page.locator("#chk-backlinks").uncheck();

  await hoverNode(page, "1000-beers");
  await page.waitForTimeout(100);

  const fills = await getNodeFills(page);

  // BL-only neighbour must be dimmed when BL edges are hidden
  expect(fills.get("buying-beer-like-a-nerd")).toBe("rgba(74,144,184,0.15)");

  // evolving-as-a-beer-drinker is a SE neighbour of 1000-beers so it stays highlighted
  expect(fills.get("evolving-as-a-beer-drinker")).not.toBe("rgba(74,144,184,0.15)");
});
