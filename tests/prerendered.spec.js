// @ts-check

/**
 * Data pages paint their key content before any script runs.
 *
 *  - Dashboards: _data/prerendered.json (scripts/prerender-insights.js) holds
 *    the stat cards, year buttons, entity switcher and leaderboard as the
 *    dashboard renders them for the default all-time window; the page serves
 *    that HTML and the dashboard replaces it on load. The served markup must
 *    equal what the dashboard renders, or the page jumps (and the snapshot is
 *    stale: re-run `npm run prerender`), and replacing must not duplicate.
 *  - Recent lists: the first five rows are served visible, exactly as the
 *    first "load more" batch leaves them.
 *
 * Runs against the real build and real data, unmodified.
 */

const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");

const SNAPSHOT_FILE = path.join(__dirname, "..", "_data", "prerendered.json");
const PARTS = {
  stat_rows: "stat-rows",
  year_buttons: "year-buttons",
  entity_bar: "entity-bar",
  top_list: "top-list",
};

function snapshot() {
  if (!fs.existsSync(SNAPSHOT_FILE))
    throw new Error("no _data/prerendered.json: run `npm run prerender`");
  return JSON.parse(fs.readFileSync(SNAPSHOT_FILE, "utf8"));
}

/** Markup with whitespace between tags collapsed, for comparing renders. */
const norm = (html) => html.replace(/>\s+</g, "><").replace(/\s+/g, " ").trim();

/** The live innerHTML of a dashboard part, with selection state written back as attributes. */
const livePart = (page, id) =>
  page.evaluate((elId) => {
    const el = document.getElementById(elId);
    if (!el) return null;
    el.querySelectorAll("option").forEach((o) => o.toggleAttribute("selected", o.selected));
    el.querySelectorAll("input").forEach((i) => i.toggleAttribute("checked", i.checked));
    return el.innerHTML;
  }, id);

// .html URLs: the test server (python -m http.server) has no extensionless ones
const RECENT_PAGES = [
  "/data/beer.html",
  "/data/movies.html",
  "/data/tv.html",
  "/data/books-read.html",
  "/data/steps.html",
  "/data/lifting.html",
  "/data/cardio.html",
];

const DASHBOARDS = Object.entries(fs.existsSync(SNAPSHOT_FILE) ? snapshot() : {});

test("every dashboard on a data page has a prerendered snapshot", async () => {
  // A dashboard missing from the snapshot paints late; the list must not be empty either.
  expect(DASHBOARDS.length).toBeGreaterThan(0);
  for (const page of [
    "/data/beer.html",
    "/data/movies.html",
    "/inventory/books-owned.html",
    "/inventory/records.html",
  ]) {
    expect(
      DASHBOARDS.some(([, d]) => d.page === page),
      page,
    ).toBe(true);
  }
});

for (const [prefix, snap] of DASHBOARDS) {
  test.describe(`${snap.page} (${prefix || "no prefix"})`, () => {
    test("served HTML already holds the dashboard parts", async ({ request }) => {
      const html = await (await request.get(snap.page)).text();
      for (const [key, suffix] of Object.entries(PARTS)) {
        if (!snap[key]) continue;
        const m = html.match(
          new RegExp(`id="${prefix}${suffix}"[^>]*>([\\s\\S]*?)</(div|span)>\\s*(<|$)`),
        );
        expect(m, `${prefix}${suffix} in served HTML`).not.toBeNull();
        expect(norm(m?.[1] ?? "").length, `${prefix}${suffix} is not empty`).toBeGreaterThan(0);
      }
    });

    // dateless dashboards have no range inputs, so no test rather than a skipped one
    if (snap.range_start)
      test("served date inputs carry the dashboard's value, min and max", async ({ request }) => {
        // min/max set the input's width (no max: room for a six-digit year), so
        // serving them without would reflow the row when the dashboard sets them.
        const html = await (await request.get(snap.page)).text();
        for (const [key, value] of [
          ["start", snap.range_start],
          ["end", snap.range_end],
        ]) {
          const tag =
            html.match(new RegExp(`<input[^>]*id="${prefix}range-${key}"[^>]*>`))?.[0] ?? "";
          expect(tag).toContain(`value="${value}"`);
          expect(tag).toContain(`min="${snap.range_start}"`);
          expect(tag).toContain(`max="${snap.range_end}"`);
        }
      });

    test("the dashboard renders exactly the served markup, once", async ({ page }) => {
      await page.goto(snap.page);
      // Wait until the dashboard has run: its stat values are no longer placeholders.
      await expect(
        page.locator(`#${prefix}stat-rows [id^="${prefix}stat-"]`).first(),
      ).not.toHaveText("—");
      for (const [key, suffix] of Object.entries(PARTS)) {
        if (!snap[key]) continue;
        const live = await livePart(page, prefix + suffix);
        expect(
          norm(live ?? ""),
          `${prefix}${suffix} matches its snapshot (stale? run npm run prerender)`,
        ).toBe(norm(snap[key]));
      }
      // Served date-range values are the ones the dashboard sets (else the row reflows).
      for (const key of ["range_start", "range_end"]) {
        if (!snap[key]) continue;
        const input = page.locator(`#${prefix}${key.replace("_", "-")}`);
        await expect(input).toHaveValue(snap[key]);
      }
      // Replacing, not appending: one switcher, unique year buttons.
      if (snap.entity_bar)
        await expect(
          page.locator(`#${prefix}entity-bar select[aria-label="Explore by"]`),
        ).toHaveCount(1);
      const years = await page.locator(`#${prefix}year-buttons button`).allTextContents();
      expect(new Set(years).size).toBe(years.length);
    });
  });
}

test.describe("recent lists, before any script runs", () => {
  test.use({ javaScriptEnabled: false });
  for (const url of RECENT_PAGES) {
    test(`${url} shows its five newest entries`, async ({ page }) => {
      await page.goto(url);
      await expect(page.locator("#recent-list .recent-item:visible")).toHaveCount(5);
    });
  }
});

test.describe("recent lists, after scripts run", () => {
  for (const url of RECENT_PAGES) {
    test(`${url} keeps the same five, then loads five more`, async ({ page }) => {
      await page.goto(url);
      const items = page.locator("#recent-list .recent-item");
      await expect(page.locator("#recent-list .recent-item:visible")).toHaveCount(5);
      // the fifth closes the batch without a border; the first four keep theirs
      await expect(items.nth(4)).not.toHaveClass(/border-bottom/);
      await expect(items.nth(3)).toHaveClass(/border-bottom/);
      await page.locator("#load-more-btn").click();
      await expect(page.locator("#recent-list .recent-item:visible")).toHaveCount(10);
      await expect(items.nth(4)).toHaveClass(/border-bottom/);
    });
  }
});
