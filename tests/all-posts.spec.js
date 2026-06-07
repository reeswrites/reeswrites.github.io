// @ts-check

/**
 * Characterization tests for the All Posts garden page (/posts/all/).
 *
 * These tests lock in the CURRENT behaviour so that silent regressions during
 * refactoring or feature work surface as failures.  They are "golden-master"
 * tests: expected values were derived from the frozen fixture and the
 * all-posts.js source.
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
 *    Date sort  → Hidden Patterns first  (2025-04-20 newer)
 *    Relevance sort → Serendipity first  (title match wins)
 *
 * ── Known bugs documented (not fixed) ────────────────────────────────────────
 *  See tests/all-posts-findings.md.
 *  Tests that characterize buggy behaviour are labelled [BUG].
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
  // The spotlight section is only shown when at least one post shares month+day
  // with today (frozen: May 15).  Travel Reflections is dated 2024-05-15.
  await expect(page.locator("#spotlights")).not.toHaveClass(/d-none/);
  await expect(page.locator("#spotlight_grid .card")).toHaveCount(1);
  await expect(page.locator("#spotlight_grid .card-header")).toHaveText("On This Day");
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

  // Helper: assert the badge count inside a type button
  const typeCount = (label) =>
    page
      .locator("#postTypeOdomoter button")
      .filter({ hasText: new RegExp(`^${label}`) })
      .locator(".badge");

  await expect(typeCount("Article")).toHaveText("2");
  await expect(typeCount("Essay")).toHaveText("2");
  await expect(typeCount("List")).toHaveText("1");
  await expect(typeCount("Notes")).toHaveText("2");
  await expect(typeCount("Project")).toHaveText("1");
  await expect(typeCount("Recipe")).toHaveText("1");
  await expect(typeCount("Stub")).toHaveText("1");
});


test("tag filter dropdown is populated with exactly 11 non-year tag checkboxes", async ({ page }) => {
  await page.locator("#tagFilterBtn").click();
  const checkboxes = page.locator("#tagFilterMenu input[type='checkbox']");
  await expect(checkboxes).toHaveCount(11);
});

// ── 2. Search ─────────────────────────────────────────────────────────────────

test("search filters cards to only matching posts", async ({ page }) => {
  // "music" appears in titles / tags of Live Music Experiences and Music Notes only
  await page.locator("#searchInput").fill("music");
  await page.waitForTimeout(300); // past 250ms debounce
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

test("default sort is by date: newest post first among matches", async ({ page }) => {
  // "music" matches Live Music Experiences (2024-07-22) and Music Notes (2024-01-05)
  // Date sort: 2024-07-22 > 2024-01-05 → Live Music first
  await page.locator("#searchInput").fill("music");
  await page.waitForTimeout(300);
  const titles = await cardTitles(page);
  expect(titles[0]).toBe("Live Music Experiences");
  expect(titles[1]).toBe("Music Notes");
});

test("switching to relevance sort: title-match ranks above body-only match", async ({ page }) => {
  // "serendipity" query:
  //   Serendipity in Everyday Life: title starts with query → high score (710)
  //   Hidden Patterns: only in content body → low score (10)
  // Date sort would put Hidden Patterns (2025-04-20) first.
  // Relevance sort puts Serendipity (score 710) first.
  await page.locator("#searchInput").fill("serendipity");
  await page.waitForTimeout(300);

  // Confirm date sort puts Hidden Patterns first
  let titles = await cardTitles(page);
  expect(titles[0]).toBe("Hidden Patterns");
  expect(titles[1]).toBe("Serendipity in Everyday Life");

  // Switch to relevance
  await page.locator("#sortByRelevance").click();
  titles = await cardTitles(page);
  expect(titles[0]).toBe("Serendipity in Everyday Life");
  expect(titles[1]).toBe("Hidden Patterns");
});

test("active sort button gets btn-secondary style", async ({ page }) => {
  await page.locator("#searchInput").fill("music");
  await page.waitForTimeout(300);

  // Date is active by default
  await expect(page.locator("#sortByDate")).toHaveClass(/btn-secondary/);
  await expect(page.locator("#sortByRelevance")).toHaveClass(/btn-outline-secondary/);

  // Switch to relevance
  await page.locator("#sortByRelevance").click();
  await expect(page.locator("#sortByRelevance")).toHaveClass(/btn-secondary/);
  await expect(page.locator("#sortByDate")).toHaveClass(/btn-outline-secondary/);
});

test("query match in title is wrapped in <mark> highlight", async ({ page }) => {
  // "patterns" appears in the title "Hidden Patterns"
  await page.locator("#searchInput").fill("patterns");
  await page.waitForTimeout(300);

  // The first card should be Hidden Patterns (2025-04-20, newest match)
  const titleMark = page.locator("#card_grid .card").first().locator(".card-body a mark");
  await expect(titleMark).toHaveText("Patterns");
});

test("body-only match shows italic excerpt instead of description", async ({ page }) => {
  // "serendipity" appears only in the content of Hidden Patterns (not in its
  // title, description, or tags), so an excerpt should be shown.
  await page.locator("#searchInput").fill("serendipity");
  await page.waitForTimeout(300);

  // Hidden Patterns is the body-only match; its card should show a fst-italic excerpt
  const hiddenCard = page.locator("#card_grid .card").filter({ hasText: "Hidden Patterns" });

  const excerpt = hiddenCard.locator(".fst-italic.small");
  await expect(excerpt).toBeVisible();
  // The excerpt should contain the highlighted match
  await expect(excerpt.locator("mark")).toHaveText("Serendipity");
  // The description text should NOT be shown
  await expect(hiddenCard).not.toContainText(
    "Looking at patterns in data to surface hidden insights.",
  );
});

test("title-match shows description (not excerpt)", async ({ page }) => {
  // Serendipity in Everyday Life: title starts with query → inTitle=true → description shown
  await page.locator("#searchInput").fill("serendipity");
  await page.waitForTimeout(300);

  const serendipityCard = page
    .locator("#card_grid .card")
    .filter({ hasText: "Serendipity in Everyday Life" });

  // Description is shown
  await expect(serendipityCard).toContainText(
    "An essay on unexpected discoveries and happy accidents.",
  );
  // No italic excerpt element
  await expect(serendipityCard.locator(".fst-italic.small")).toHaveCount(0);
});

test("no-results message shown when query matches nothing", async ({ page }) => {
  await page.locator("#searchInput").fill("xyznonexistentquery");
  await page.waitForTimeout(300);

  await expect(page.locator("#card_grid .card")).toHaveCount(0);
  await expect(page.locator("#card_grid p.text-muted")).toContainText(
    'No posts matched "xyznonexistentquery"',
  );
});

test("clearing search via native × restores all cards", async ({ page }) => {
  await page.locator("#searchInput").fill("music");
  await page.waitForTimeout(300);
  expect(await cardTitles(page)).toHaveLength(2);

  // Clear the input (simulates native × button behaviour)
  await page.locator("#searchInput").clear();
  // Trigger the "search" event that the native × dispatches
  await page.locator("#searchInput").dispatchEvent("search");
  await page.waitForTimeout(300);

  await expect(page.locator("#card_grid .card")).toHaveCount(POST_COUNT);
});

test("search query encoded as ?q= and sort as ?sort= in URL", async ({ page }) => {
  await page.locator("#searchInput").fill("music");
  await page.waitForTimeout(300);

  let params = await urlParams(page);
  expect(params.q).toBe("music");
  expect(params.sort).toBe("date");

  await page.locator("#sortByRelevance").click();
  params = await urlParams(page);
  expect(params.sort).toBe("relevance");
});

test("?q= and ?sort= removed from URL when search is cleared", async ({ page }) => {
  await page.locator("#searchInput").fill("music");
  await page.waitForTimeout(300);
  await page.locator("#searchInput").clear();
  await page.locator("#searchInput").dispatchEvent("search");
  await page.waitForTimeout(300);

  const params = await urlParams(page);
  expect(params.q).toBeUndefined();
  expect(params.sort).toBeUndefined();
});

test("odometer counts update to reflect active search filter", async ({ page }) => {
  // "music" matches 2 posts: Live Music Experiences (stub, concerts, no year)
  //                           Music Notes (notes, music, 2024)
  await page.locator("#searchInput").fill("music");
  await page.waitForTimeout(300);

  // Notes type: 1 match (Music Notes); Stub: 1 match (Live Music Experiences)
  const notesCount = page
    .locator("#postTypeOdomoter button")
    .filter({ hasText: /^Notes/ })
    .locator(".badge");
  await expect(notesCount).toHaveText("1");

  const stubCount = page
    .locator("#postTypeOdomoter button")
    .filter({ hasText: /^Stub/ })
    .locator(".badge");
  await expect(stubCount).toHaveText("1");

});

// ── 3. Tag filter via checkbox dropdown ───────────────────────────────────────

test("selecting a tag in the dropdown filters posts to those with that tag", async ({ page }) => {
  await selectTag(page, "music");

  const titles = await cardTitles(page);
  // music tag: Live Music Experiences and Music Notes
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
  // music posts: Live Music Experiences, Music Notes (2 posts)
  // beer posts: Beer Notes (1 post)
  // Together: 3 distinct posts
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
  // notes type: Music Notes, Beer Notes
  expect(titles).toHaveLength(2);
  expect(titles).toContain("Music Notes");
  expect(titles).toContain("Beer Notes");
});

test("active type button gets btn-secondary class", async ({ page }) => {
  await clickTypeButton(page, "Notes");
  await expect(page.locator("#postTypeOdomoter button").filter({ hasText: /^Notes/ })).toHaveClass(
    /btn-secondary/,
  );
  // Other buttons remain outline
  await expect(
    page.locator("#postTypeOdomoter button").filter({ hasText: /^Article/ }),
  ).toHaveClass(/btn-outline-secondary/);
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

test("clicking an active type button deselects it and restores all posts", async ({ page }) => {
  await clickTypeButton(page, "Notes");
  expect(await cardTitles(page)).toHaveLength(2);

  await clickTypeButton(page, "Notes"); // click again to deselect
  await expect(page.locator("#card_grid .card")).toHaveCount(POST_COUNT);
});

test("combined type + tag filter uses AND semantics across kinds", async ({ page }) => {
  // article type posts: Hidden Patterns, Travel Reflections
  // travel tag posts: Travel Reflections
  // Intersection: Travel Reflections only
  await clickTypeButton(page, "Article");
  await selectTag(page, "travel");

  const titles = await cardTitles(page);
  expect(titles).toHaveLength(1);
  expect(titles[0]).toBe("Travel Reflections");
});

// ── 5. Card badges ────────────────────────────────────────────────────────────

test("clicking a type badge in a card toggles that type filter", async ({ page }) => {
  // Find the "Notes" type badge on the Music Notes card
  const musicNotesCard = page.locator("#card_grid .card").filter({ hasText: "Music Notes" });

  // The type badge is the first .badge in card-body
  await musicNotesCard.locator(".card-body .badge").first().click();
  await page.waitForTimeout(150);

  // Now only notes-type posts should be shown
  const titles = await cardTitles(page);
  expect(titles).toHaveLength(2);
  expect(titles).toContain("Music Notes");
  expect(titles).toContain("Beer Notes");
});

test("clicking a tag badge in a card checks the tag in the dropdown", async ({ page }) => {
  // The "philosophy" tag badge on the "Serendipity in Everyday Life" card
  const serendipityCard = page
    .locator("#card_grid .card")
    .filter({ hasText: "Serendipity in Everyday Life" });

  // Click the "Philosophy" badge (type badge is first, tags follow)
  await serendipityCard.locator(".badge", { hasText: "Philosophy" }).click();
  await page.waitForTimeout(150);

  // The "philosophy" checkbox should now be checked in the dropdown
  await expect(
    page.locator('#tagFilterMenu input[type="checkbox"][value="philosophy"]'),
  ).toBeChecked();

  // Filter is active: philosophy posts = Serendipity in Everyday Life + On Caring Deeply
  const titles = await cardTitles(page);
  expect(titles).toHaveLength(2);
  expect(titles).toContain("Serendipity in Everyday Life");
  expect(titles).toContain("On Caring Deeply");
});

// ── 7. Clear filters ──────────────────────────────────────────────────────────

test("clear filters button resets type and tag filters and shows all posts", async ({ page }) => {
  await clickTypeButton(page, "Article");
  await selectTag(page, "travel");
  expect(await cardTitles(page)).toHaveLength(1); // AND intersection

  await page.locator("#clearFilters").click();
  await page.waitForTimeout(150);

  await expect(page.locator("#card_grid .card")).toHaveCount(POST_COUNT);
});

test("clear filters hides #filterView and shows #filterHelp", async ({ page }) => {
  await clickTypeButton(page, "Notes");
  await page.locator("#clearFilters").click();
  await page.waitForTimeout(150);

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

// ── 8. Share link ─────────────────────────────────────────────────────────────

test("share button triggers alert with the current page URL", async ({ page }) => {
  // Activate a filter so #filterView (and thus #shareFilters) is visible
  await clickTypeButton(page, "Notes");

  let dialogMessage = "";
  page.once("dialog", async (dialog) => {
    dialogMessage = dialog.message();
    await dialog.accept();
  });

  await page.locator("#shareFilters").click();

  // The alert message should mention copying
  expect(dialogMessage).toContain("Copied share link");
});

// ── 9. Deep-link / URL restore ────────────────────────────────────────────────

test("?types=article restores type filter: 2 cards, Article button active", async ({ page }) => {
  // Navigate to a fresh URL with the type param (fixture already injected)
  await page.goto("/posts/all/?types=article");
  await waitReady(page);

  const titles = await cardTitles(page);
  expect(titles).toHaveLength(2);
  expect(titles).toContain("Hidden Patterns");
  expect(titles).toContain("Travel Reflections");

  await expect(
    page.locator("#postTypeOdomoter button").filter({ hasText: /^Article/ }),
  ).toHaveClass(/btn-secondary/);

  await expect(page.locator("#filterView")).not.toHaveClass(/d-none/);
  expect(await activeFilterText(page)).toBe("Article");
});

test("?tags=music restores tag filter and checks the music checkbox", async ({ page }) => {
  await page.goto("/posts/all/?tags=music");
  await waitReady(page);

  const titles = await cardTitles(page);
  expect(titles).toHaveLength(2);
  expect(titles).toContain("Live Music Experiences");
  expect(titles).toContain("Music Notes");

  // The music checkbox should be checked in the dropdown
  await expect(
    page.locator('#tagFilterMenu input[type="checkbox"][value="music"]'),
  ).toBeChecked();
});

test("?q=music&sort=relevance restores search input, sort mode, and results", async ({ page }) => {
  await page.goto("/posts/all/?q=music&sort=relevance");
  await waitReady(page);

  // Search box is populated
  await expect(page.locator("#searchInput")).toHaveValue("music");

  // Sort buttons are visible; Relevance is active
  await expect(page.locator("#sortByRelevance")).toHaveClass(/btn-secondary/);
  await expect(page.locator("#sortByDate")).toHaveClass(/btn-outline-secondary/);

  // Results are filtered
  const titles = await cardTitles(page);
  expect(titles).toHaveLength(2);
});

test("?types=article&tags=music restores combined type+tag filter", async ({ page }) => {
  // No article has a music tag → 0 cards
  await page.goto("/posts/all/?types=article&tags=music");
  await waitReady(page);

  await expect(page.locator("#card_grid .card")).toHaveCount(0);
  await expect(page.locator("#card_grid p.text-muted")).toBeVisible();

  // Both filters are shown as active
  const text = await activeFilterText(page);
  expect(text).toContain("Article");
  expect(text).toContain("Music");
});

test("invalid types and tags in URL are silently ignored", async ({ page }) => {
  await page.goto("/posts/all/?types=invalidtype&tags=invalidtag");
  await waitReady(page);

  // No valid filters → all 10 cards shown
  await expect(page.locator("#card_grid .card")).toHaveCount(POST_COUNT);
  // filterView should remain hidden (no active filters)
  await expect(page.locator("#filterView")).toHaveClass(/d-none/);
});

// ── 10. Smoke ─────────────────────────────────────────────────────────────────

test("random post button is present and scrolls without JS errors", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));

  await expect(page.locator("#randomPostBtn")).toBeVisible();
  await page.locator("#randomPostBtn").click();

  // No uncaught JS errors from the scroll
  expect(errors).toHaveLength(0);
});

test("back-to-top button is hidden initially and appears after scroll", async ({ page }) => {
  await expect(page.locator("#btn-back-to-top")).toBeHidden();

  // Scroll down past the 20px threshold
  await page.evaluate(() => window.scrollTo(0, 200));
  await page.waitForTimeout(100);

  await expect(page.locator("#btn-back-to-top")).toBeVisible();
});
