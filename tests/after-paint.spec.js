// @ts-check

/**
 * Data pages hold their body scripts until first paint
 * (_includes/after-paint-loader.html), then run all of them, in order.
 *
 * The page must keep working exactly as when the scripts ran during parsing:
 * every held script runs, inline ones still share the global scope, and the
 * document stops pretending to be "loading" once they are done.
 */

const { test, expect } = require("@playwright/test");

const PAGES = ["/data/beer.html", "/inventory/records.html", "/data/listening.html"];

for (const url of PAGES) {
  test.describe(url, () => {
    test("served HTML holds every body script except the loader", async ({ request }) => {
      const html = await (await request.get(url)).text();
      const body = html.slice(html.indexOf("<body"));
      const scripts = body.match(/<script\b[^>]*>/g) || [];
      const live = scripts.filter((t) => !t.includes('type="text/x-after-paint"'));
      expect(scripts.length).toBeGreaterThan(5);
      expect(live, "only the loader itself runs during parsing").toHaveLength(1);
    });

    test("after load every held script has run and the document is really ready", async ({
      page,
    }) => {
      await page.goto(url);
      await expect(page.locator('script[type="text/x-after-paint"]')).toHaveCount(0);
      await expect.poll(() => page.evaluate(() => document.readyState)).toBe("complete");
      // own-property override gone: readyState comes from Document.prototype again
      expect(
        await page.evaluate(() => Object.getOwnPropertyDescriptor(document, "readyState")),
      ).toBeUndefined();
    });
  });
}

test("inline scripts still share top-level declarations across script tags", async ({ page }) => {
  // beer's data file declares CHECKINS; a later inline script builds the dashboard from it
  await page.goto("/data/beer.html");
  await expect
    .poll(() => page.evaluate(() => typeof CHECKINS !== "undefined" && CHECKINS.length))
    .toBeGreaterThan(50);
  await expect
    .poll(() => page.evaluate(() => window.INSIGHTS_DATASETS?.beer?.rows?.length))
    .toBeGreaterThan(50);
});
