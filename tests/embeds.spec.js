// @ts-check

/**
 * E2E tests for media embeds (_includes/embed.html).
 *
 * The weekly media posts are imported from Substack, where the body is full of
 * YouTube and TikTok players. `pipenv run substack` writes each one back out as
 * `{% include embed.html %}`, so this post is the fixture: 7 YouTube embeds and
 * 5 TikTok embeds, with no third-party JS involved.
 *
 * The no-table assertion is a regression guard: video titles routinely contain a
 * pipe ("… | #38"), and an unescaped pipe in a markdown link label makes kramdown
 * render the whole line as a table instead of a link.
 */

const { test, expect } = require("@playwright/test");

const POST = "/posts/things-i-watched-the-week-of-2026-08-02/";

test.beforeEach(async ({ page }) => {
  await page.goto(POST);
});

test("renders every carried-over player as an embed figure", async ({ page }) => {
  await expect(page.locator("figure.embed--wide")).toHaveCount(7);
  await expect(page.locator("figure.embed--vertical")).toHaveCount(5);
});

test("embeds point at the privacy-preserving player urls and load lazily", async ({ page }) => {
  const youtube = page.locator("figure.embed--wide iframe").first();
  const tiktok = page.locator("figure.embed--vertical iframe").first();

  await expect(youtube).toHaveAttribute(
    "src",
    /^https:\/\/www\.youtube-nocookie\.com\/embed\/[\w-]+$/,
  );
  await expect(tiktok).toHaveAttribute("src", /^https:\/\/www\.tiktok\.com\/embed\/v2\/\d+$/);
  await expect(youtube).toHaveAttribute("loading", "lazy");
  await expect(tiktok).toHaveAttribute("loading", "lazy");
});

test("keeps the link to the original under each embed", async ({ page }) => {
  const caption = page.locator("figure.embed--wide .embed__caption a").first();

  await expect(caption).toHaveAttribute("href", "https://www.youtube.com/watch?v=e1cg0jPrBDw");
  await expect(caption).toHaveText(
    "Show Us Your Bed, We Guess Who's Been In It | #38 — Interior Motives",
  );
});

test("a pipe in an embed title does not become a table", async ({ page }) => {
  await expect(page.locator("section.e-content table")).toHaveCount(0);
});

test("embeds stay inside the page on a phone-sized viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  const article = await page.locator("figure.embed--wide").first().boundingBox();
  const frame = await page.locator("figure.embed--wide .embed__frame").first().boundingBox();

  expect(frame.width).toBeLessThanOrEqual(article.width);
  // 16:9, so the player never towers over the text it sits in
  expect(Math.abs(frame.width / frame.height - 16 / 9)).toBeLessThan(0.05);

  const vertical = await page.locator("figure.embed--vertical .embed__frame").first().boundingBox();

  expect(vertical.width).toBeLessThanOrEqual(325);
});

// ── Tweets ────────────────────────────────────────────────────────────────────

/**
 * Tweets have no iframe player: the post ships the blockquote that
 * platform.twitter.com/widgets.js upgrades in place. These tests block that
 * script so they assert on our own markup — the same thing a reader with the
 * script blocked sees — rather than racing X's renderer.
 */

const TWEET_POST = "/posts/why-code-to-make-art-and-play-games/";

test.describe("tweet embeds", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("https://platform.twitter.com/**", (route) => route.abort());
  });

  test("ships the tweet as a blockquote widgets.js can upgrade", async ({ page }) => {
    await page.goto(TWEET_POST);

    const quote = page.locator("figure.embed--tweet blockquote.twitter-tweet");

    await expect(quote).toHaveCount(1);
    await expect(quote).toContainText("internalised facts are your bullshit filters");
    await expect(quote.locator("a")).toHaveAttribute(
      "href",
      "https://twitter.com/i/status/2080305033271230690",
    );
    await expect(quote).toHaveAttribute("data-dnt", "true");
  });

  test("loads widgets.js only on posts that have a tweet", async ({ page }) => {
    await page.goto(TWEET_POST);
    await expect(
      page.locator('script[src*="platform.twitter.com/widgets.js"]'),
    ).toHaveCount(1);

    await page.goto(POST);
    await expect(
      page.locator('script[src*="platform.twitter.com/widgets.js"]'),
    ).toHaveCount(0);
  });

  test("hands the widget the page's theme before it renders", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto(TWEET_POST);

    await expect(page.locator("figure.embed--tweet blockquote")).toHaveAttribute(
      "data-theme",
      "dark",
    );

    await page.emulateMedia({ colorScheme: "light" });
    await page.goto(TWEET_POST);

    await expect(
      page.locator("figure.embed--tweet blockquote"),
    ).not.toHaveAttribute("data-theme", "dark");
  });
});
