// @ts-check

/**
 * E2E tests for the /data/movies page.
 *
 * ── Coverage ──────────────────────────────────────────────────────────────────
 *  1. Insights tab is the default active tab
 *  2. Recently-watched section shows movie cards
 *  3. Per-year and rating-distribution charts render
 *  4. Calendar tab lazy-renders when clicked, opening on the most recent date
 *  5. Table rating column carries text-nowrap so emojis don't wrap
 *  6. Card view renders cards in reverse-chronological order (newest first)
 *  7. Tab ordering: Insights, Calendar, Table, Card
 */

const { test, expect } = require("@playwright/test");

async function gotoMovies(page) {
  await page.goto("/data/movies.html");
}

// ── 1. Page load & default tab ────────────────────────────────────────────────

test("insights tab is active by default", async ({ page }) => {
  await gotoMovies(page);
  await expect(page.locator("#insights-tab")).toHaveClass(/active/);
  await expect(page.locator("#insights-tab-pane")).toHaveClass(/show/);
  await expect(page.locator("#insights-tab-pane")).toHaveClass(/active/);
});

test("other tabs are not active on load", async ({ page }) => {
  await gotoMovies(page);
  await expect(page.locator("#calendar-tab")).not.toHaveClass(/active/);
  await expect(page.locator("#table-tab")).not.toHaveClass(/active/);
});

// ── 2. Tab ordering ───────────────────────────────────────────────────────────

test("tabs appear in order: Insights, Calendar, Table", async ({ page }) => {
  await gotoMovies(page);
  const tabs = page.locator("#myTab .nav-link");
  await expect(tabs).toHaveCount(3);
  await expect(tabs.nth(0)).toHaveAttribute("id", "insights-tab");
  await expect(tabs.nth(1)).toHaveAttribute("id", "calendar-tab");
  await expect(tabs.nth(2)).toHaveAttribute("id", "table-tab");
});

// ── 3. Insights — recently watched ───────────────────────────────────────────

test("insights tab shows at least one recently-watched movie card", async ({ page }) => {
  await gotoMovies(page);
  const cards = page.locator("#insights-tab-pane .card");
  await expect(cards.first()).toBeVisible({ timeout: 8_000 });
  await expect(cards).toHaveCount(9);
});

test("first recently-watched card is the most recent movie and shows year inline with title", async ({
  page,
}) => {
  await gotoMovies(page);
  // After sort: "date" | reverse, the first card is from 2026. The title includes
  // the release year in parentheses and the watch date is shown on its own line.
  const firstCard = page.locator("#insights-tab-pane .card").first();
  await expect(firstCard).toContainText("2026");
  // Title should contain "(year)" — the card-title h5 includes "(year)" inline
  await expect(firstCard.locator(".card-title")).toContainText("(");
});

// ── 4. Insights — charts ──────────────────────────────────────────────────────

test("per-year chart renders an SVG", async ({ page }) => {
  await gotoMovies(page);
  await expect(page.locator("#year-chart svg")).toBeVisible({ timeout: 10_000 });
});

test("rating distribution chart renders an SVG", async ({ page }) => {
  await gotoMovies(page);
  await expect(page.locator("#rating-chart svg")).toBeVisible({ timeout: 10_000 });
});

// ── 5. Calendar tab — lazy render ─────────────────────────────────────────────

test("calendar is not rendered until its tab is clicked", async ({ page }) => {
  await gotoMovies(page);
  // Before clicking, FullCalendar should not have injected its markup yet.
  await expect(page.locator(".fc")).toHaveCount(0);
});

test("clicking calendar tab renders FullCalendar", async ({ page }) => {
  await gotoMovies(page);
  await page.locator("#calendar-tab").click();
  await expect(page.locator(".fc")).toBeVisible({ timeout: 10_000 });
});

test("calendar opens on the month of the most recent movie", async ({ page }) => {
  await gotoMovies(page);
  await page.locator("#calendar-tab").click();
  // The most recent date is 2026-03-30, so the calendar title should mention March 2026.
  await expect(page.locator(".fc-toolbar-title")).toContainText("March 2026", { timeout: 10_000 });
});

// ── 6. Table — rating column doesn't wrap ─────────────────────────────────────

test("table rating cells have text-nowrap class", async ({ page }) => {
  await gotoMovies(page);
  await page.locator("#table-tab").click();
  await expect(page.locator("#myTable tbody tr:first-child td:nth-child(3)")).toHaveClass(
    /text-nowrap/,
    { timeout: 8_000 },
  );
});

test("table shows correct column headers", async ({ page }) => {
  await gotoMovies(page);
  await page.locator("#table-tab").click();
  const headers = page.locator("#myTable thead td");
  await expect(headers.nth(0)).toContainText("Name");
  await expect(headers.nth(2)).toContainText("Rating");
  await expect(headers.nth(4)).toContainText("Watch Date");
});
