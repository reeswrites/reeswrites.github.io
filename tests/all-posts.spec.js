// @ts-check

/**
 * E2E tests for the All Posts garden page (/posts/all/).
 *
 * ── Determinism strategy ──────────────────────────────────────────────────────
 * Before each navigation, injectFixture() replaces window.POSTS_DATA with a
 * 10-post frozen array (posts-data.json) and freezes Date to May 15 2026, making
 * the "On This Day" section and timeago footers deterministic.  Jekyll's real
 * inline POSTS_DATA assignment silently no-ops (non-writable property).
 *
 * ── Fixture summary ───────────────────────────────────────────────────────────
 *  10 posts covering all 7 hardcoded types (article×2, essay×2, notes×2,
 *  list, project, recipe, stub).
 *
 *  Year tags:   2025×2  2024×4  2023×3
 *  Non-year tags (11, checkbox dropdown options): beer, concerts, cooking, data, food,
 *    music, philosophy, relationships, software, technology, travel
 *
 *  "On This Day" post: Travel Reflections (2024-05-15 = frozen May 15)
 *
 *  Relevance-vs-date test query "serendipity":
 *    Serendipity in Everyday Life — title match, date 2025-02-14 → score 710
 *    Hidden Patterns              — body-only match, date 2025-04-20 → score 10
 *    Relevance sort → Serendipity first  (title match wins)
 *    Date sort  → Hidden Patterns first  (2025-04-20 newer)
 *
 *  Default sort mode: "relevance" (globalSortMode default changed in c7ff7b9)
 */

const { test, expect } = require("@playwright/test");
const FIXTURE = require("./fixtures/posts-data.json");
const {
  injectFixture,
  gotoAllPosts,
  waitReady,
  cardTitles,
  selectTag,
  removeTag,
  activeFilterText,
  urlParams,
  clickTypeButton,
} = require("./helpers/all-posts");
const POST_COUNT = FIXTURE.length; // 10

// ── Shared setup ──────────────────────────────────────────────────────────────

test.beforeEach(async ({ page }) => {
  await injectFixture(page, FIXTURE);
  await gotoAllPosts(page);
  await waitReady(page);
});

// ── 1. Initial structure ──────────────────────────────────────────────────────

test("renders all 10 fixture posts as cards", async ({ page }) => {
  await expect(page.locator("#card_grid .card")).toHaveCount(POST_COUNT);
});

test("shows the On-This-Day featured section with Travel Reflections", async ({ page }) => {
  await expect(page.locator("#spotlights")).not.toHaveClass(/d-none/);
  await expect(page.locator("#spotlight_grid .card")).toHaveCount(1);
  await expect(page.locator("#spotlight_grid .card .card-body a")).toHaveText("Travel Reflections");
});

test("shows filter hint, hides filter view, hides sort buttons on load", async ({ page }) => {
  await expect(page.locator("#filterHelp")).not.toHaveClass(/d-none/);
  await expect(page.locator("#filterView")).toHaveClass(/d-none/);
  await expect(page.locator("#sortByDate")).toHaveClass(/d-none/);
  await expect(page.locator("#sortByRelevance")).toHaveClass(/d-none/);
});

test("type odometer has 7 buttons with correct initial counts", async ({ page }) => {
  await expect(page.locator("#postTypeOdomoter button")).toHaveCount(7);

  const typeCount = (label) =>
    page
      .locator("#postTypeOdomoter button")
      .filter({ hasText: new RegExp(`^${label}`) })
      .locator(".badge");

  await expect(typeCount("Article")).toHaveText("2");
  await expect(typeCount("Essay")).toHaveText("2");
  await expect(typeCount("Notes")).toHaveText("2");
  await expect(typeCount("Stub")).toHaveText("1");
});

test("tag filter dropdown is populated with exactly 11 non-year tag checkboxes", async ({
  page,
}) => {
  await page.locator("#tagFilterBtn").click();
  const checkboxes = page.locator("#tagFilterMenu input[type='checkbox']");
  await expect(checkboxes).toHaveCount(11);
});

// ── 2. Search ─────────────────────────────────────────────────────────────────

test("search filters cards to only matching posts", async ({ page }) => {
  await page.locator("#searchInput").fill("music");
  await page.waitForTimeout(300);
  const titles = await cardTitles(page);
  expect(titles).toHaveLength(2);
  expect(titles).toContain("Live Music Experiences");
  expect(titles).toContain("Music Notes");
});

test("search makes sort buttons appear", async ({ page }) => {
  await page.locator("#searchInput").fill("music");
  await page.waitForTimeout(300);
  await expect(page.locator("#sortByDate")).not.toHaveClass(/d-none/);
  await expect(page.locator("#sortByRelevance")).not.toHaveClass(/d-none/);
});

test("default sort is relevance: title-start-match ranks above body-only match", async ({
  page,
}) => {
  // "serendipity" query:
  //   Serendipity in Everyday Life: title starts with query → high score
  //   Hidden Patterns: only in content body → low score
  // With default relevance sort, Serendipity appears first.
  await page.locator("#searchInput").fill("serendipity");
  await page.waitForTimeout(300);
  const titles = await cardTitles(page);
  expect(titles[0]).toBe("Serendipity in Everyday Life");
  expect(titles[1]).toBe("Hidden Patterns");
});

test("switching to date sort puts newest post first among matches", async ({ page }) => {
  // "serendipity": Hidden Patterns (2025-04-20) is newer than Serendipity (2025-02-14)
  await page.locator("#searchInput").fill("serendipity");
  await page.waitForTimeout(300);
  await page.locator("#sortByDate").click();
  const titles = await cardTitles(page);
  expect(titles[0]).toBe("Hidden Patterns");
  expect(titles[1]).toBe("Serendipity in Everyday Life");
});

test("active sort button gets btn-secondary style", async ({ page }) => {
  await page.locator("#searchInput").fill("music");
  await page.waitForTimeout(300);

  // Relevance is active by default
  await expect(page.locator("#sortByRelevance")).toHaveClass(/btn-secondary/);
  await expect(page.locator("#sortByDate")).toHaveClass(/btn-outline-secondary/);

  await page.locator("#sortByDate").click();
  await expect(page.locator("#sortByDate")).toHaveClass(/btn-secondary/);
  await expect(page.locator("#sortByRelevance")).toHaveClass(/btn-outline-secondary/);
});

test("no-results message shown when query matches nothing", async ({ page }) => {
  await page.locator("#searchInput").fill("xyznonexistentquery");
  await page.waitForTimeout(300);
  await expect(page.locator("#card_grid .card")).toHaveCount(0);
  await expect(page.locator("#card_grid p.text-muted")).toContainText(
    'No posts matched "xyznonexistentquery"',
  );
});

test("search query encoded as ?q= and sort as ?sort= in URL", async ({ page }) => {
  await page.locator("#searchInput").fill("music");
  await page.waitForTimeout(300);

  let params = await urlParams(page);
  expect(params.q).toBe("music");
  expect(params.sort).toBe("relevance");

  await page.locator("#sortByDate").click();
  params = await urlParams(page);
  expect(params.sort).toBe("date");
});

// ── 3. Tag filter via checkbox dropdown ───────────────────────────────────────

test("selecting a tag in the dropdown filters posts to those with that tag", async ({ page }) => {
  await selectTag(page, "music");

  const titles = await cardTitles(page);
  expect(titles).toHaveLength(2);
  expect(titles).toContain("Live Music Experiences");
  expect(titles).toContain("Music Notes");
});

test("tag filter shows #filterView and hides #filterHelp", async ({ page }) => {
  await selectTag(page, "music");
  await expect(page.locator("#filterView")).not.toHaveClass(/d-none/);
  await expect(page.locator("#filterHelp")).toHaveClass(/d-none/);
});

test("active filter text lists the selected tag", async ({ page }) => {
  await selectTag(page, "music");
  expect(await activeFilterText(page)).toBe("Music");
});

test("tag filter adds ?tags= to URL", async ({ page }) => {
  await selectTag(page, "music");
  const params = await urlParams(page);
  expect(params.tags).toBe("music");
});

test("removing a tag from the dropdown restores the full card list", async ({ page }) => {
  await selectTag(page, "music");
  expect(await cardTitles(page)).toHaveLength(2);
  await removeTag(page, "music");
  await expect(page.locator("#card_grid .card")).toHaveCount(POST_COUNT);
});

test("OR semantics: two selected tags show posts matching either tag", async ({ page }) => {
  await selectTag(page, "music");
  await selectTag(page, "beer");

  const titles = await cardTitles(page);
  expect(titles).toHaveLength(3);
  expect(titles).toContain("Live Music Experiences");
  expect(titles).toContain("Music Notes");
  expect(titles).toContain("Beer Notes");
});

// ── 4. Type filter via odometer ───────────────────────────────────────────────

test("clicking a type button filters posts to that type", async ({ page }) => {
  await clickTypeButton(page, "Notes");

  const titles = await cardTitles(page);
  expect(titles).toHaveLength(2);
  expect(titles).toContain("Music Notes");
  expect(titles).toContain("Beer Notes");
});

test("type filter shows #filterView with correct active filter text", async ({ page }) => {
  await clickTypeButton(page, "Article");
  await expect(page.locator("#filterView")).not.toHaveClass(/d-none/);
  expect(await activeFilterText(page)).toBe("Article");
});

test("type filter adds ?types= to URL", async ({ page }) => {
  await clickTypeButton(page, "Article");
  const params = await urlParams(page);
  expect(params.types).toBe("article");
});

test("combined type + tag filter uses AND semantics across kinds", async ({ page }) => {
  // article type: Hidden Patterns, Travel Reflections
  // travel tag: Travel Reflections
  // Intersection: Travel Reflections only
  await clickTypeButton(page, "Article");
  await selectTag(page, "travel");

  const titles = await cardTitles(page);
  expect(titles).toHaveLength(1);
  expect(titles[0]).toBe("Travel Reflections");
});

test("clicking a tag badge in a card checks the tag in the dropdown", async ({ page }) => {
  const serendipityCard = page
    .locator("#card_grid .card")
    .filter({ hasText: "Serendipity in Everyday Life" });

  await serendipityCard.locator(".badge", { hasText: "Philosophy" }).click();
  await page.waitForTimeout(150);

  await expect(
    page.locator('#tagFilterMenu input[type="checkbox"][value="philosophy"]'),
  ).toBeChecked();

  const titles = await cardTitles(page);
  expect(titles).toHaveLength(2);
  expect(titles).toContain("Serendipity in Everyday Life");
  expect(titles).toContain("On Caring Deeply");
});

// ── 5. Clear filters ──────────────────────────────────────────────────────────

test("clear filters button resets type and tag filters and shows all posts", async ({ page }) => {
  await clickTypeButton(page, "Article");
  await selectTag(page, "travel");
  expect(await cardTitles(page)).toHaveLength(1);

  await page.locator("#clearFilters").click();
  await page.waitForTimeout(150);

  await expect(page.locator("#card_grid .card")).toHaveCount(POST_COUNT);
  await expect(page.locator("#filterView")).toHaveClass(/d-none/);
  await expect(page.locator("#filterHelp")).not.toHaveClass(/d-none/);
});

test("clear filters unchecks all checkboxes in the dropdown", async ({ page }) => {
  await selectTag(page, "music");
  await expect(page.locator('#tagFilterMenu input[type="checkbox"]:checked')).toHaveCount(1);

  await page.locator("#clearFilters").click();
  await page.waitForTimeout(150);

  await expect(page.locator('#tagFilterMenu input[type="checkbox"]:checked')).toHaveCount(0);
});

test("clear filters removes types and tags params from URL", async ({ page }) => {
  await clickTypeButton(page, "Article");
  await selectTag(page, "travel");

  await page.locator("#clearFilters").click();
  await page.waitForTimeout(150);

  const params = await urlParams(page);
  expect(params.types).toBeUndefined();
  expect(params.tags).toBeUndefined();
});

// ── 6. Deep-link / URL restore ────────────────────────────────────────────────

test("?types=article restores type filter: 2 cards, Article button active", async ({ page }) => {
  await page.goto("/posts/all/?types=article");
  await waitReady(page);

  const titles = await cardTitles(page);
  expect(titles).toHaveLength(2);
  expect(titles).toContain("Hidden Patterns");
  expect(titles).toContain("Travel Reflections");

  await expect(page.locator("#filterView")).not.toHaveClass(/d-none/);
  expect(await activeFilterText(page)).toBe("Article");
});

test("?tags=music restores tag filter and checks the music checkbox", async ({ page }) => {
  await page.goto("/posts/all/?tags=music");
  await waitReady(page);

  const titles = await cardTitles(page);
  expect(titles).toHaveLength(2);

  await expect(page.locator('#tagFilterMenu input[type="checkbox"][value="music"]')).toBeChecked();
});

test("?q=music&sort=date restores search input and date sort mode", async ({ page }) => {
  await page.goto("/posts/all/?q=music&sort=date");
  await waitReady(page);

  await expect(page.locator("#searchInput")).toHaveValue("music");
  await expect(page.locator("#sortByDate")).toHaveClass(/btn-secondary/);
  await expect(page.locator("#sortByRelevance")).toHaveClass(/btn-outline-secondary/);

  const titles = await cardTitles(page);
  expect(titles).toHaveLength(2);
});
