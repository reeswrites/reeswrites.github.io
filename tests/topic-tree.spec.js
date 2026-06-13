// @ts-check

/**
 * Tests for the topic-tree browse page (/posts/topics/).
 *
 * Uses a small frozen fixture (2 top-level topic clusters + 5 post leaves)
 * injected via addInitScript before page load, so the Jekyll-inlined Liquid
 * data is silently no-opped and the fixture wins.
 *
 * ── Fixture summary ──────────────────────────────────────────────────────────
 *  Root topic: "Philosophy · Ethics" (5 posts)
 *    Child 0: topic "Philosophy · Ethics · Meaning" (3 posts)
 *      - "Virtue and Practice" (essay)
 *      - "Ethics of Care" (article)
 *      - "Moral Luck" (notes)
 *    Child 1: topic "Technology · Software" (2 posts)
 *      - "Building CLI Tools" (project)
 *      - "Static Site Generators" (list)
 */

const { test, expect } = require("@playwright/test");
const FIXTURE = require("./fixtures/topic-tree-data.json");
const { injectFixture } = require("./helpers/topic-tree");

// ── Shared setup ──────────────────────────────────────────────────────────────

test.beforeEach(async ({ page }) => {
  await injectFixture(page, FIXTURE);
  await page.goto("/posts/topics/");
  // Wait for the JS module to render at least one card
  await expect(page.locator("#tt-children .tt-card").first()).toBeVisible({
    timeout: 8_000,
  });
});

// ── 1. Page load & initial structure ─────────────────────────────────────────

test("renders top-level topic cards at root", async ({ page }) => {
  // Fixture root has 2 topic children
  await expect(page.locator(".tt-card-topic")).toHaveCount(2);
  await expect(page.locator(".tt-card-post")).toHaveCount(0);
});

test("root breadcrumb shows only 'Topics' as current", async ({ page }) => {
  await expect(page.locator(".tt-crumb-current")).toContainText("Topics");
  // No clickable crumb links at root
  await expect(page.locator(".tt-crumb-link")).toHaveCount(0);
});

test("topic cards show label, representative, and post count", async ({ page }) => {
  const first = page.locator(".tt-card-topic").first();
  await expect(first.locator(".tt-card-label")).toContainText("Philosophy");
  await expect(first.locator(".tt-card-rep")).toContainText("Virtue and Practice");
  await expect(first.locator(".tt-card-count")).toContainText("essay");
});

// ── 2. Drill-down navigation ──────────────────────────────────────────────────

test("clicking a topic card drills into it and shows its children", async ({ page }) => {
  // Click the first topic (Philosophy · Ethics · Meaning, 3 posts)
  await page.locator(".tt-card-topic").first().click();

  // Should now show 3 post leaf cards, no more topic cards
  await expect(page.locator(".tt-card-post")).toHaveCount(3);
  await expect(page.locator(".tt-card-topic")).toHaveCount(0);
});

test("post leaf cards show title, description, type, and date", async ({ page }) => {
  await page.locator(".tt-card-topic").first().click();

  const first = page.locator(".tt-card-post").first();
  await expect(first.locator(".tt-card-title")).toContainText("Virtue and Practice");
  await expect(first.locator(".tt-card-desc")).toContainText("virtuous habits");
  await expect(first.locator(".tt-card-type")).toContainText("essay");
  await expect(first.locator(".tt-card-date")).toContainText("2023");
});

test("post leaf card links to the correct post URL", async ({ page }) => {
  await page.locator(".tt-card-topic").first().click();
  const first = page.locator(".tt-card-post").first();
  await expect(first).toHaveAttribute("href", "/posts/virtue-and-practice");
});

// ── 3. Breadcrumb navigation ──────────────────────────────────────────────────

test("breadcrumb updates after drilling into a topic", async ({ page }) => {
  await page.locator(".tt-card-topic").first().click();

  // Breadcrumb: "Topics › Philosophy · Ethics · Meaning" (current)
  await expect(page.locator(".tt-crumb-link")).toHaveCount(1);
  await expect(page.locator(".tt-crumb-link").first()).toContainText("Topics");
  await expect(page.locator(".tt-crumb-current")).toContainText("Philosophy");
});

test("clicking a breadcrumb ancestor navigates back to that level", async ({ page }) => {
  // Drill in to first topic
  await page.locator(".tt-card-topic").first().click();
  await expect(page.locator(".tt-card-post")).toHaveCount(3);

  // Click the "Topics" breadcrumb link to go back to root
  await page.locator(".tt-crumb-link").first().click();

  // Should be back at root showing 2 topic cards
  await expect(page.locator(".tt-card-topic")).toHaveCount(2);
  await expect(page.locator(".tt-card-post")).toHaveCount(0);
  await expect(page.locator(".tt-crumb-current")).toContainText("Topics");
});

// ── 4. Keyboard accessibility ─────────────────────────────────────────────────

test("topic card can be activated with Enter key", async ({ page }) => {
  const firstTopic = page.locator(".tt-card-topic").first();
  await firstTopic.focus();
  await firstTopic.press("Enter");
  await expect(page.locator(".tt-card-post")).toHaveCount(3);
});

// ── 5. Menu link ──────────────────────────────────────────────────────────────

test("'topics' link is present in the navbar", async ({ page }) => {
  // The link is in the "my writing" dropdown — check it exists in the DOM
  // (Bootstrap collapses dropdown items; visibility check requires clicking first,
  // which is tested implicitly by the page loading successfully at /posts/topics/).
  await expect(page.locator("a[href='/posts/topics']")).toHaveCount(1);
});
