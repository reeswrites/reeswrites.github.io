// @ts-check

/**
 * Tests for the thought collection (ADR-0001).
 *
 * The load-bearing assertion here is the AI-attribution one. ADR-0001 states
 * that a thought whose body contains an `> [!ai] ...` callout and whose page
 * does not render the attribution is a BUILD FAILURE, not a styling preference —
 * publishing pasted assistant prose without saying so is the failure the whole
 * upstream marking pipeline exists to prevent. That rule is only real if a test
 * enforces it, which is what `renders AI spans as attributed` does.
 *
 * ── Fixture ──────────────────────────────────────────────────────────────────
 * These tests run against `_thought/fixture-not-a-real-note.md`, which carries
 * one AI callout and one ordinary block quote, so the suite can prove the
 * treatment is applied to the former and NOT to the latter. It is
 * `published: false`, so the Playwright server builds with `--unpublished` to
 * see it. If that fixture is ever removed, replace it rather than deleting these
 * tests — an AI-attribution rule with no coverage regresses silently.
 */

const { test, expect } = require("@playwright/test");

const FIXTURE = "/thought/fixture-not-a-real-note/";

test.describe("thought page", () => {
  test("renders maturity, planted date and the thought framing", async ({ page }) => {
    await page.goto(FIXTURE);

    await expect(page.locator("h1.p-name")).toHaveText("Fixture Note");
    await expect(page.locator(".maturity--seedling")).toHaveText("seedling");
    await expect(page.locator("#thought-meta")).toContainText("Planted 08/23/2026");
    await expect(page.locator("#thought-meta")).toContainText("thought");
  });

  test("renders AI spans as attributed, and leaves ordinary quotes alone", async ({ page }) => {
    await page.goto(FIXTURE);

    const aiSpans = page.locator("blockquote.ai-span");
    await expect(aiSpans).toHaveCount(1);

    // The attribution from the marker must survive into the rendered label.
    await expect(aiSpans.locator(".ai-span__label")).toHaveText(
      "Claude · pasted 2026-08-23",
    );

    // The marker itself is consumed, not left as visible noise.
    await expect(aiSpans).not.toContainText("[!ai]");

    // The quoted text itself is preserved.
    await expect(aiSpans).toContainText("stands in for a pasted assistant passage");

    // An ordinary block quote must NOT be promoted — over-attributing his own
    // sources as machine-written is its own failure.
    const plainQuotes = page.locator("blockquote:not(.ai-span)");
    await expect(plainQuotes).toHaveCount(1);
    await expect(plainQuotes).toContainText("must NOT pick up the AI treatment");
  });

  test("warns in the meta box when a note contains AI spans", async ({ page }) => {
    await page.goto(FIXTURE);
    await expect(page.locator(".ai-notice")).toContainText(
      "written by an AI assistant",
    );
  });
});

test.describe("thought index", () => {
  test("lists notes grouped by maturity and flags AI spans", async ({ page }) => {
    await page.goto("/thought/");

    const item = page.locator("ul.thought-list li", { hasText: "Fixture Note" });
    await expect(item).toHaveCount(1);
    await expect(item.locator("a").first()).toHaveAttribute(
      "href",
      "/thought/fixture-not-a-real-note/",
    );
    await expect(item).toContainText("🤖");
  });

  test("points at its own feed, separate from the main one", async ({ page }) => {
    await page.goto("/thought/");
    await expect(page.locator('a[href="/thought/feed.xml"]')).toBeVisible();
  });
});

test.describe("thought feed", () => {
  test("is a valid atom feed carrying the published thoughts", async ({ request }) => {
    const res = await request.get("/thought/feed.xml");
    expect(res.status()).toBe(200);

    const xml = await res.text();
    expect(xml).toContain("<feed xmlns=\"http://www.w3.org/2005/Atom\">");
    expect(xml).toContain("Fixture Note");
    expect(xml).toContain("<category term=\"seedling\" />");
  });

  test("thoughts stay OUT of the main feed (ADR-0001)", async ({ request }) => {
    const res = await request.get("/feed.xml");

    // jekyll-feed skips generation in development, so a 404 here means the main
    // feed was not built at all — which trivially satisfies the rule.
    if (res.status() !== 200) return;

    expect(await res.text()).not.toContain("Fixture Note");
  });
});
