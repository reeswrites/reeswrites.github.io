// @ts-check

/**
 * E2E tests for the /data/listening page (Insights dashboard + Table View tab).
 *
 * ── Determinism strategy ─────────────────────────────────────────────────────
 * The Insights dashboard fetches /static/data/scrobbles.json at runtime.
 * Before each test, injectFixture() intercepts that request and returns the
 * frozen scrobbles-data.json fixture, and FrozenDate patches new Date() to
 * June 2, 2026 so time-relative presets are deterministic.
 *
 * ── Fixture summary (scrobbles-data.json) ────────────────────────────────────
 *  3 artists  — Artist Alpha, Artist Beta, Artist Gamma
 *  3 albums   — Album One, Album Two, Album Three
 *  4 songs    — Song One, Song Two, Song Three, Song Four
 *  4 tracks:
 *    track 0: Artist Alpha / Album One / Song One
 *    track 1: Artist Alpha / Album One / Song Two
 *    track 2: Artist Beta  / Album Two  / Song Three
 *    track 3: Artist Gamma / Album Three / Song Four
 *
 *  7 weeks:
 *    idx 0: 2023-01-02   idx 1: 2023-01-09   idx 2: 2023-06-05
 *    idx 3: 2024-01-01   idx 4: 2024-06-03   idx 5: 2025-07-07
 *    idx 6: 2026-01-05
 *
 *  8 play entries [trackIdx, weekIdx, count]:
 *    [0,0,10] [1,1,5] [2,2,8] [3,3,3] [2,3,4] [0,4,6] [0,5,9] [1,6,2]
 *
 *  All-time totals:
 *    plays: 47  |  unique artists: 3  |  unique songs (tracks): 4
 *    Artist Alpha: 32  (Song One: 25, Song Two: 7)
 *    Artist Beta:  12  (Song Three: 12)
 *    Artist Gamma:  3  (Song Four: 3)
 *    Album One: 32  |  Album Two: 12  |  Album Three: 3
 *    Busiest month: Jan 2023 (15 plays — weeks 0+1)
 *
 *  Year windows:
 *    2023 → weeks 0-2 → 23 plays, 2 artists, 3 songs
 *    2024 → weeks 3-4 → 13 plays, 3 artists, 3 songs
 *    2025 → week  5   →  9 plays, 1 artist,  1 song
 *    2026 → week  6   →  2 plays, 1 artist,  1 song
 *
 *  Time presets (frozen to 2026-06-02):
 *    This year       → 2026 → 2 plays
 *    Last 12 months  → weeks 5+6 (≥ 2025-06-03) → 11 plays
 */

const { test, expect } = require("@playwright/test");
const FIXTURE = require("./fixtures/scrobbles-data.json");
const { injectFixture, gotoListening, waitForInsights } = require("./helpers/listening");

// ── Shared setup ──────────────────────────────────────────────────────────────

test.beforeEach(async ({ page }) => {
  await injectFixture(page, FIXTURE);
  await gotoListening(page);
  await waitForInsights(page);
});

// ── 1. Page load & structure ──────────────────────────────────────────────────

test("shows insights tab active and hides loading indicator after load", async ({ page }) => {
  await expect(page.locator("#insights-loading")).not.toBeVisible();
  await expect(page.locator("#insights-content")).toBeVisible();
  await expect(page.locator("#insights-tab")).toHaveClass(/active/);
});

test("renders all preset buttons including dynamic year buttons", async ({ page }) => {
  await expect(page.locator("#btn-alltime")).toBeVisible();
  await expect(page.locator("#btn-thisyear")).toBeVisible();
  await expect(page.locator("#btn-last12")).toBeVisible();
  for (const year of ["2023", "2024", "2025", "2026"]) {
    await expect(page.locator(`#year-buttons [data-year="${year}"]`)).toBeVisible();
  }
});

// ── 2. All-time stats ─────────────────────────────────────────────────────────

test("all-time window shows correct summary stats", async ({ page }) => {
  await expect(page.locator("#stat-total")).toHaveText("47");
  await expect(page.locator("#stat-artists")).toHaveText("3");
  await expect(page.locator("#stat-songs")).toHaveText("4");
  await expect(page.locator("#stat-busiest-month")).toHaveText("Jan 2023 (15 plays)");
  await expect(page.locator("#stat-top-artist")).toHaveText("Artist Alpha (32)");
  await expect(page.locator("#stat-top-album")).toHaveText("Album One by Artist Alpha (32)");
  await expect(page.locator("#stat-top-song")).toHaveText("Song One by Artist Alpha (25)");
});

test("all-time preset button is active on load", async ({ page }) => {
  await expect(page.locator("#btn-alltime")).toHaveClass(/btn-secondary/);
  await expect(page.locator("#btn-alltime")).not.toHaveClass(/btn-outline-secondary/);
});

// ── 3. Year presets ───────────────────────────────────────────────────────────

test("selecting year 2023 filters to that year and activates its button", async ({ page }) => {
  await page.locator("#year-buttons [data-year='2023']").click();

  await expect(page.locator("#stat-total")).toHaveText("23");
  await expect(page.locator("#stat-artists")).toHaveText("2");
  await expect(page.locator("#stat-songs")).toHaveText("3");

  // Year button becomes active; all-time button deactivates
  await expect(page.locator("#year-buttons [data-year='2023']")).toHaveClass(/btn-secondary/);
  await expect(page.locator("#btn-alltime")).toHaveClass(/btn-outline-secondary/);
});

test("selecting year 2024 shows correct stats", async ({ page }) => {
  await page.locator("#year-buttons [data-year='2024']").click();

  await expect(page.locator("#stat-total")).toHaveText("13");
  await expect(page.locator("#stat-artists")).toHaveText("3");
  await expect(page.locator("#stat-songs")).toHaveText("3");
  await expect(page.locator("#stat-top-artist")).toHaveText("Artist Alpha (6)");
});

test("selecting year 2025 shows correct stats", async ({ page }) => {
  await page.locator("#year-buttons [data-year='2025']").click();

  await expect(page.locator("#stat-total")).toHaveText("9");
  await expect(page.locator("#stat-artists")).toHaveText("1");
  await expect(page.locator("#stat-songs")).toHaveText("1");
  await expect(page.locator("#stat-top-artist")).toHaveText("Artist Alpha (9)");
});

// ── 4. Built-in presets ───────────────────────────────────────────────────────

test("'This year' preset shows only 2026 data and activates its button", async ({ page }) => {
  await page.locator("#btn-thisyear").click();

  await expect(page.locator("#stat-total")).toHaveText("2");
  await expect(page.locator("#stat-artists")).toHaveText("1");
  await expect(page.locator("#stat-songs")).toHaveText("1");
  await expect(page.locator("#btn-thisyear")).toHaveClass(/btn-secondary/);
});

test("'Last 12 months' preset covers weeks from 2025-07 and 2026-01", async ({ page }) => {
  await page.locator("#btn-last12").click();

  // weeks 5 (9 plays) + 6 (2 plays) = 11
  await expect(page.locator("#stat-total")).toHaveText("11");
  await expect(page.locator("#stat-artists")).toHaveText("1");
  await expect(page.locator("#stat-songs")).toHaveText("2");
  await expect(page.locator("#btn-last12")).toHaveClass(/btn-secondary/);
});

test("clicking all-time after a year preset reactivates the all-time button", async ({ page }) => {
  await page.locator("#year-buttons [data-year='2023']").click();
  await page.locator("#btn-alltime").click();

  await expect(page.locator("#stat-total")).toHaveText("47");
  await expect(page.locator("#btn-alltime")).toHaveClass(/btn-secondary/);
  await expect(page.locator("#year-buttons [data-year='2023']")).toHaveClass(
    /btn-outline-secondary/,
  );
});

// ── 5. Custom range ───────────────────────────────────────────────────────────

test("custom range inputs reflect current window months", async ({ page }) => {
  // All-time: first week = 2023-01-02 → "2023-01", last = 2026-01-05 → "2026-01"
  await expect(page.locator("#range-start")).toHaveValue("2023-01");
  await expect(page.locator("#range-end")).toHaveValue("2026-01");
});

test("custom range picker filters data to the specified months", async ({ page }) => {
  // Target: 2024-01 through 2024-06 → weeks 3 (2024-01-01) and 4 (2024-06-03)
  // Plays: [3,3,3] + [2,3,4] + [0,4,6] = 13 total, 3 artists
  await page.locator("#range-start").fill("2024-01");
  await page.locator("#range-end").fill("2024-06");
  await page.locator("#range-end").dispatchEvent("change");

  await expect(page.locator("#stat-total")).toHaveText("13");
  await expect(page.locator("#stat-artists")).toHaveText("3");
});

test("custom range updating start re-applies when end is already set", async ({ page }) => {
  // Narrow to 2025+ only: week 5 and 6 → 11 plays
  await page.locator("#range-start").fill("2025-01");
  await page.locator("#range-start").dispatchEvent("change");

  await expect(page.locator("#stat-total")).toHaveText("11");
});

// ── 6. Entity toggle ──────────────────────────────────────────────────────────

test("top list shows artists by default with correct ranking", async ({ page }) => {
  const names = page.locator("#top-list .fw-semibold");
  await expect(names).toHaveCount(3);
  await expect(names.nth(0)).toHaveText("Artist Alpha");
  await expect(names.nth(1)).toHaveText("Artist Beta");
  await expect(names.nth(2)).toHaveText("Artist Gamma");
});

test("entity toggle switches to albums and shows correct ranking", async ({ page }) => {
  await page.locator("[data-entity='albums']").click();

  const names = page.locator("#top-list .fw-semibold");
  await expect(names).toHaveCount(3);
  await expect(names.nth(0)).toHaveText("Album One");
  await expect(names.nth(1)).toHaveText("Album Two");
  await expect(names.nth(2)).toHaveText("Album Three");

  // Albums button becomes active
  await expect(page.locator("[data-entity='albums']")).toHaveClass(/btn-secondary/);
});

test("entity toggle switches to songs and shows all 4 unique songs", async ({ page }) => {
  await page.locator("[data-entity='songs']").click();

  const names = page.locator("#top-list .fw-semibold");
  await expect(names).toHaveCount(4);
  await expect(names.nth(0)).toHaveText("Song One"); // 25 plays

  await expect(page.locator("[data-entity='songs']")).toHaveClass(/btn-secondary/);
});

test("top list play counts match fixture data", async ({ page }) => {
  // First artist: Artist Alpha with 32 plays (first item gets " plays" suffix)
  const counts = page.locator("#top-list .text-nowrap");
  await expect(counts.first()).toHaveText("32 plays");
  // Subsequent items show bare counts
  await expect(counts.nth(1)).toHaveText("12");
});

test("album rows show the artist as sub-text", async ({ page }) => {
  await page.locator("[data-entity='albums']").click();
  // Album One belongs to Artist Alpha
  await expect(page.locator("#top-list small.text-muted").first()).toHaveText("Artist Alpha");
});

test("song rows show artist as sub-text", async ({ page }) => {
  await page.locator("[data-entity='songs']").click();
  // Song One → artist is "Artist Alpha"
  await expect(page.locator("#top-list small.text-muted").first()).toHaveText("Artist Alpha");
});

// ── 7. Entity toggle + window interaction ─────────────────────────────────────

test("entity toggle persists across window changes", async ({ page }) => {
  // Switch to albums, then change year — should still show albums
  await page.locator("[data-entity='albums']").click();
  await page.locator("#year-buttons [data-year='2023']").click();

  // In 2023: tracks 0,1,2 → albums One (15 plays) and Two (8 plays)
  await expect(page.locator("#top-list .fw-semibold").nth(0)).toHaveText("Album One");
  await expect(page.locator("[data-entity='albums']")).toHaveClass(/btn-secondary/);
});

// ── 8. Timeline chart ─────────────────────────────────────────────────────────

test("timeline chart renders an SVG element after load", async ({ page }) => {
  await expect(page.locator("#timeline-chart svg")).toBeVisible({ timeout: 10_000 });
});

test("timeline chart re-renders when the window changes", async ({ page }) => {
  // After year change the SVG should still exist (not blank)
  await page.locator("#year-buttons [data-year='2024']").click();
  await expect(page.locator("#timeline-chart svg")).toBeVisible({ timeout: 10_000 });
});

// ── 9. Table View tab ─────────────────────────────────────────────────────────

test("table view tab is visible and shows correct column headers", async ({ page }) => {
  await page.locator("#table-tab").click();
  await expect(page.locator("#table-tab-pane")).toBeVisible();

  const headers = page.locator("#myTable thead th");
  await expect(headers.nth(0)).toContainText("Song");
  await expect(headers.nth(1)).toContainText("Artist");
  await expect(headers.nth(2)).toContainText("# of Listens");
  await expect(headers.nth(3)).toContainText("Album");
});

test("table view tab shows the underlying data table with rows", async ({ page }) => {
  await page.locator("#table-tab").click();
  // The Liquid-rendered tbody has at least one data row from the real music.json.
  await expect(page.locator("#myTable tbody tr").first()).toBeVisible({ timeout: 8_000 });
});

test("switching back to insights tab after table view keeps insights working", async ({ page }) => {
  await page.locator("#table-tab").click();
  await page.locator("#insights-tab").click();

  await expect(page.locator("#insights-content")).toBeVisible();
  // Stats should still reflect all-time window
  await expect(page.locator("#stat-total")).toHaveText("47");
});

// ── 10. Genre filter bar ──────────────────────────────────────────────────────
// Filter bar built from data-genre table row attrs via data-filters.js.

test("genre filter bar is present in the table tab", async ({ page }) => {
  await page.locator("#table-tab").click();
  await expect(page.locator("#data-filter-bar")).toBeVisible();
  await expect(page.locator("#filter-genre-btn")).toBeVisible();
});
