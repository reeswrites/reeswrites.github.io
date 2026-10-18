// @ts-check

/**
 * Shell + data-file pattern (see _includes/page-data.html).
 *
 * Big data pages render only their first rows inline and keep the full lists
 * and datasets in static/data/pages/<name>.js, preloaded from <head>. These
 * tests pin the contract against the real build. Expected counts come from
 * the source data in _data/, never from the data file under test, so a
 * truncated or stale data file fails.
 *
 *   - the head preloads the exact URL the page then loads as a script
 *   - the HTML inlines exactly the first SHELL_ROWS rows of each list
 *   - after load, every list and the DataTable hold every source row, and
 *     the filter menus offer every value in the source data (they are built
 *     from the rows at init, so this proves the swap ran first)
 *   - with JavaScript off, the inlined first rows are still there
 */

const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");

const SHELL_ROWS = 50;
const ROOT = path.join(__dirname, "..");
const data = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, "_data", p), "utf8"));
const distinct = (values) => [...new Set(values.filter(Boolean))].sort();
const lowerPiped = (list) => (list || []).join("|").toLowerCase().split("|");

const beers = data("beers.json").checkins;
const movies = data("media/movies.json").watched;
const shows = data("media/tv.json").shows;
const books = data("media/books.json");
const scrobbles = data("media/music.json").scrobbles;
const postCount = fs.readdirSync(path.join(ROOT, "_posts")).filter((f) => f.endsWith(".md")).length;

/**
 * Per page: data file name, and from the source data the expected full size
 * of each list, plus the expected values of its genre filter. `extraRows`
 * are table rows not taken from the main list (books currently reading).
 */
const PAGES = [
  {
    url: "/data/beer.html",
    name: "beer",
    table: beers.length,
    recent: beers.length,
    genres: distinct(beers.map((b) => b.beer_type)),
  },
  {
    url: "/data/movies.html",
    name: "movies",
    table: movies.length,
    recent: movies.length,
    genres: distinct(movies.flatMap((m) => lowerPiped(m.genres))),
  },
  {
    url: "/data/tv.html",
    name: "tv",
    table: shows.length,
    recent: shows.filter((s) => s.last_watched_at).length,
    genres: distinct(shows.flatMap((s) => lowerPiped(s.genres))),
  },
  {
    url: "/data/books-read.html",
    name: "books-read",
    table: books.read.length,
    extraRows: (books.currently_reading || []).length,
    recent: books.read.length,
    genres: distinct(books.read.flatMap((b) => lowerPiped(b.genres))),
  },
  {
    url: "/inventory/books-owned.html",
    name: "books-owned",
    table: books.owned.length,
    genres: distinct(books.owned.flatMap((b) => lowerPiped(b.genres))),
  },
  {
    url: "/data/listening.html",
    name: "listening",
    table: scrobbles.length,
    genres: distinct(scrobbles.flatMap((s) => lowerPiped(s.tags))),
  },
];

const countRows = (html) => (html.match(/<(tr|li)\b/g) || []).length;

/** Inner HTML of the first element matching an opening-tag regex, or fail. */
function inner(html, openTag, closeTag, what) {
  const m = html.match(new RegExp(`${openTag}([\\s\\S]*?)${closeTag}`));
  if (!m) throw new Error(`${what} not found in the served HTML`);
  return m[1];
}

/** The page's preload link and data script, read from the DOM. */
const dataFileTags = (page, name) =>
  page.evaluate((n) => {
    const href = (el) =>
      el && new URL(el.getAttribute(el.tagName === "LINK" ? "href" : "src"), location.href).href;
    const link = [...document.head.querySelectorAll('link[rel="preload"]')].find((l) =>
      l.getAttribute("href").includes(`/static/data/pages/${n}.js`),
    );
    const script = [...document.scripts].find((s) =>
      (s.getAttribute("src") || "").includes(`/static/data/pages/${n}.js`),
    );
    return { preload: href(link), as: link?.getAttribute("as"), script: href(script) };
  }, name);

for (const p of PAGES) {
  test.describe(p.name, () => {
    test("head preloads the exact data file URL the page loads", async ({ page }) => {
      await page.goto(p.url);
      const tags = await dataFileTags(page, p.name);
      expect(tags.preload, "preload link in <head>").toMatch(
        new RegExp(`/static/data/pages/${p.name}\\.js\\?v=\\d+$`),
      );
      expect(tags.as).toBe("script");
      expect(tags.script).toBe(tags.preload);
    });

    test("HTML inlines exactly the first rows of each list", async ({ request }) => {
      const html = await (await request.get(p.url)).text();
      const tbody = inner(html, "<tbody[^>]*>", "</tbody>", "table body");
      expect(countRows(tbody)).toBe(Math.min(SHELL_ROWS, p.table) + (p.extraRows || 0));
      if (p.recent !== undefined) {
        const recent = inner(html, '<ul id="recent-list"[^>]*>', "</ul>", "recent list");
        // TV's recent list skips shows never watched inside the first 50
        expect(countRows(recent)).toBeGreaterThan(0);
        expect(countRows(recent)).toBeLessThanOrEqual(SHELL_ROWS);
      }
    });

    test("after load, lists, table and filters cover every source row", async ({ page }) => {
      await page.goto(p.url);
      // DataTables detaches off-page rows, so ask the table once it exists;
      // pages that build it lazily (on tab show) still hold every row as DOM
      const rows = await page.evaluate(() =>
        DataTable.isDataTable("#myTable")
          ? new DataTable.Api("#myTable").rows().count()
          : document.querySelectorAll("#myTable tbody tr").length,
      );
      expect(rows).toBe(p.table + (p.extraRows || 0));
      if (p.recent !== undefined)
        await expect(page.locator("#recent-list > li")).toHaveCount(p.recent);

      const offered = await page
        .locator("#filter-genre-menu input[type=checkbox]")
        .evaluateAll((els) => els.map((e) => /** @type {HTMLInputElement} */ (e).value).sort());
      expect(offered).toEqual(p.genres);
    });
  });
}

test.describe("all-posts", () => {
  test("head preloads the exact data file URL the page loads", async ({ page }) => {
    await page.goto("/posts/all/");
    const tags = await dataFileTags(page, "all-posts");
    expect(tags.preload).toMatch(/\/static\/data\/pages\/all-posts\.js\?v=\d+$/);
    expect(tags.script).toBe(tags.preload);
  });

  test("the post index holds every post", async ({ page }) => {
    await page.goto("/posts/all/");
    expect(await page.evaluate(() => window.POSTS_DATA.length)).toBe(postCount);
  });
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  for (const p of PAGES) {
    test(`${p.name} still shows the first rows`, async ({ page }) => {
      await page.goto(p.url);
      await expect(page.locator("#myTable tbody tr")).toHaveCount(
        Math.min(SHELL_ROWS, p.table) + (p.extraRows || 0),
      );
    });
  }
});
