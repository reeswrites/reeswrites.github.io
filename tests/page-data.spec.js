// @ts-check

/**
 * Shell + data-file pattern (see _includes/page-data.html).
 *
 * Big data pages render only their first rows inline and keep the full lists
 * and datasets in static/data/pages/<name>.js, preloaded from <head>. These
 * tests pin the contract against the real build:
 *   - the HTML preloads the data file and inlines at most SHELL_ROWS rows
 *   - after load, every list and the DataTable hold every row from the file
 *   - with JavaScript off, the inlined first rows are still there
 */

const { test, expect } = require("@playwright/test");

const SHELL_ROWS = 50;

/** url → data file name, and whether the page has a DataTable */
const PAGES = [
  { url: "/data/beer.html", name: "beer", table: true },
  { url: "/data/movies.html", name: "movies", table: true },
  { url: "/data/tv.html", name: "tv", table: true },
  { url: "/data/books-read.html", name: "books-read", table: true },
  { url: "/inventory/books-owned.html", name: "books-owned", table: true },
  { url: "/data/listening.html", name: "listening", table: true },
  { url: "/posts/all/", name: "all-posts", table: false },
];

const countRows = (html) => (html.match(/<(tr|li)\b/g) || []).length;

for (const { url, name, table } of PAGES) {
  test.describe(name, () => {
    test("HTML preloads the data file and inlines only the first rows", async ({ request }) => {
      const html = await (await request.get(url)).text();
      const src = new RegExp(`/static/data/pages/${name}\\.js\\?v=\\d+`);
      const preload = html.match(
        new RegExp(`<link rel="preload" href="(${src.source})" as="script">`),
      );
      expect(preload, "preload link in <head>").not.toBeNull();
      expect(html.indexOf(preload?.[0] ?? "")).toBeLessThan(html.indexOf("</head>"));
      // the script tag loads the exact preloaded URL, or the preload is wasted
      expect(html).toContain(`<script src="${preload?.[1]}"></script>`);

      const body = html.match(/<tbody>([\s\S]*?)<\/tbody>/);
      if (table) expect(countRows(body?.[1] ?? "")).toBeLessThanOrEqual(SHELL_ROWS + 2);
      const recent = html.match(/<ul id="recent-list"[^>]*>([\s\S]*?)<\/ul>/);
      if (recent) expect(countRows(recent[1])).toBeLessThanOrEqual(SHELL_ROWS);
    });

    test("after load, every list holds every row from the data file", async ({ page }) => {
      await page.goto(url);
      const fills = await page.evaluate(() =>
        Object.fromEntries(
          Object.entries(window.PAGE_FILLS || {}).map(([sel, html]) => [
            sel,
            (html.match(/<(tr|li)\b/g) || []).length,
          ]),
        ),
      );
      if (name === "all-posts") {
        const n = await page.evaluate(() => window.POSTS_DATA.length);
        expect(n).toBeGreaterThan(SHELL_ROWS);
        return;
      }
      expect(Object.keys(fills).length).toBeGreaterThan(0);
      for (const [sel, expected] of Object.entries(fills)) {
        expect(expected, `${sel} fill is the full list`).toBeGreaterThan(SHELL_ROWS);
        if (sel === "#myTable tbody") {
          // DataTables detaches off-page rows, so ask the table once it exists;
          // pages that build it lazily (on tab show) still hold every row as DOM
          const rows = await page.evaluate(() =>
            DataTable.isDataTable("#myTable")
              ? new DataTable.Api("#myTable").rows().count()
              : document.querySelectorAll("#myTable tbody tr").length,
          );
          expect(rows).toBe(expected);
        } else {
          await expect(page.locator(`${sel} > *`)).toHaveCount(expected);
        }
      }
    });
  });
}

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  for (const { url, name } of PAGES.filter((p) => p.table)) {
    test(`${name} still shows the first rows`, async ({ page }) => {
      await page.goto(url);
      const rows = await page.locator("#myTable tbody tr").count();
      expect(rows).toBeGreaterThan(0);
      expect(rows).toBeLessThanOrEqual(SHELL_ROWS + 2);
    });
  }
});
