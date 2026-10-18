// @ts-check

/**
 * Page-load quick wins, against the real build:
 *  - Disqus (its embed pulls in ad and affiliate scripts) loads only when a
 *    reader nears the comments, not on every post load.
 *  - The Bootstrap Icons stylesheet is only on pages that use icons, and does
 *    not block first paint where it is.
 *  - The home page's "recently" feed fetches the small recent file, not the
 *    whole activity feed.
 */

const { test, expect } = require("@playwright/test");

const POST = "/posts/evolving-as-a-beer-drinker/index.html";

test.describe("Disqus", () => {
  test("is not requested until the comments come into view", async ({ page }) => {
    const disqus = [];
    await page.route(/disqus\.com/, (route) => {
      disqus.push(route.request().url());
      return route.abort();
    });
    await page.goto(POST);
    await page.waitForTimeout(1000);
    expect(disqus, "nothing from Disqus on load").toEqual([]);

    await page.locator("#disqus_thread").scrollIntoViewIfNeeded();
    await expect.poll(() => disqus.some((u) => u.endsWith("/embed.js"))).toBe(true);
  });
});

test.describe("Bootstrap Icons stylesheet", () => {
  const ICONS = /bootstrap-icons[^"]*\.css/;

  test("is absent from a page without icons", async ({ request }) => {
    const html = await (await request.get(POST)).text();
    expect(html).not.toMatch(ICONS);
  });

  test("is present on a data page, without blocking first paint", async ({ request }) => {
    const html = await (await request.get("/data/beer.html")).text();
    const head = html.slice(0, html.indexOf("</head>"));
    // the <noscript> fallback is a plain (blocking) link, by design; check the rest
    const links =
      head
        .replace(/<noscript>[\s\S]*?<\/noscript>/g, "")
        .match(/<link[^>]*bootstrap-icons[^>]*>/g) || [];
    expect(links.length).toBeGreaterThan(0);
    for (const l of links)
      expect(l, "loaded as print, switched to all on load").toContain('media="print"');
    expect(head).toContain("<noscript>");
  });
});

test.describe("home activity feed", () => {
  test("fetches only the recent file and still shows ten entries", async ({ page }) => {
    const feeds = [];
    page.on("request", (r) => {
      if (r.url().includes("/static/data/activity")) feeds.push(new URL(r.url()).pathname);
    });
    await page.goto("/index.html");
    await expect(page.locator("#recently-feed li")).toHaveCount(10);
    expect(feeds).toEqual(["/static/data/activity-recent.json"]);
  });
});
