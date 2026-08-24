// @ts-check

/**
 * Tests for the garden collection (ADR-0001).
 *
 * The load-bearing assertion here is the AI-attribution one. ADR-0001 states
 * that a garden note whose body contains an `> [!ai] ...` callout and whose page
 * does not render the attribution is a BUILD FAILURE, not a styling preference —
 * publishing pasted assistant prose without saying so is the failure the whole
 * upstream marking pipeline exists to prevent. That rule is only real if a test
 * enforces it, which is what `renders AI spans as attributed` does.
 *
 * ── Fixture ──────────────────────────────────────────────────────────────────
 * These tests run against `_garden/smoke-test-delete-me.md`, which carries one
 * AI callout and one ordinary block quote, so the suite can prove the treatment
 * is applied to the former and NOT to the latter. If that fixture is ever
 * removed, replace it rather than deleting these tests — a garden with no
 * AI-span coverage is a garden that can regress silently.
 */

const { test, expect } = require("@playwright/test");

const FIXTURE = "/garden/smoke-test-delete-me/";

test.describe("garden note page", () => {
  test("renders maturity, planted date and the garden framing", async ({ page }) => {
    await page.goto(FIXTURE);

    await expect(page.locator("h1.p-name")).toHaveText("Smoke Test Note");
    await expect(page.locator(".maturity--seedling")).toHaveText("seedling");
    await expect(page.locator("#garden-meta")).toContainText("Planted 08/23/2026");
    await expect(page.locator("#garden-meta")).toContainText("garden note");
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

test.describe("garden index", () => {
  test("lists notes grouped by maturity and flags AI spans", async ({ page }) => {
    await page.goto("/garden/");

    const item = page.locator("ul.garden-list li", { hasText: "Smoke Test Note" });
    await expect(item).toHaveCount(1);
    await expect(item.locator("a").first()).toHaveAttribute(
      "href",
      "/garden/smoke-test-delete-me/",
    );
    await expect(item).toContainText("🤖");
  });

  test("points at its own feed, separate from the main one", async ({ page }) => {
    await page.goto("/garden/");
    await expect(page.locator('a[href="/garden/feed.xml"]')).toBeVisible();
  });
});

test.describe("garden feed", () => {
  test("is a valid atom feed carrying the planted notes", async ({ request }) => {
    const res = await request.get("/garden/feed.xml");
    expect(res.status()).toBe(200);

    const xml = await res.text();
    expect(xml).toContain("<feed xmlns=\"http://www.w3.org/2005/Atom\">");
    expect(xml).toContain("Smoke Test Note");
    expect(xml).toContain("<category term=\"seedling\" />");
  });

  test("garden notes stay OUT of the main feed (ADR-0001)", async ({ request }) => {
    const res = await request.get("/feed.xml");

    // jekyll-feed skips generation in development, so a 404 here means the main
    // feed was not built at all — which trivially satisfies the rule.
    if (res.status() !== 200) return;

    expect(await res.text()).not.toContain("Smoke Test Note");
  });
});

test.describe("garden URL space", () => {
  /**
   * `/garden/` is NOT a fresh namespace: the site had one before, and those URLs
   * now redirect into /posts/. A planted note whose slug collides with one of
   * them would shadow a live redirect — and "Don't Break Links" is a post on
   * this very site.
   *
   * Asserted against the built artifacts rather than by navigating, because the
   * test server (python http.server) does not resolve extensionless URLs the way
   * production does. What matters is that the redirect stub exists and still
   * points into /posts/, and that no garden note has claimed its slug.
   */
  const RESERVED = [
    "everyday-things",
    "pick-two-and-a-side",
    "search-with-simplejekyllsearch",
  ];

  for (const slug of RESERVED) {
    test(`reserved /garden/${slug} is still a redirect into /posts/`, async ({ request }) => {
      // Redirect stubs take two shapes depending on whether the original
      // `redirect_from` carried a trailing slash: `<slug>.html` or `<slug>/`.
      const candidates = [`/garden/${slug}.html`, `/garden/${slug}/`];

      let body = null;
      for (const path of candidates) {
        const res = await request.get(path);
        if (res.status() === 200) {
          body = await res.text();
          break;
        }
      }

      expect(body, `no artifact found at any of ${candidates.join(", ")}`).not.toBeNull();

      // Still a redirect into /posts/ ...
      expect(body).toMatch(/url=https?:\/\/[^"']*\/posts\//);

      // ... and NOT shadowed by a planted garden note.
      expect(
        body,
        `a garden note is shadowing the reserved redirect /garden/${slug}`,
      ).not.toContain("garden-note");
    });
  }
});
