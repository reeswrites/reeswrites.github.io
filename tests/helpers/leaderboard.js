// @ts-check
const { expect } = require("@playwright/test");

/**
 * The insights leaderboard's "Explore by" control.
 *
 * InsightsDashboard renders the entity switcher as a labelled <select>
 * (static/js/insights-dashboard.js, _buildEntityToggle). Specs reach it by
 * its accessible name, so they keep working if its markup or classes change.
 *
 * Asserting the select's value right after choosing it proves nothing; check
 * what the leaderboard shows instead. Asserting the value with no prior
 * choice is fine: that is the page's default.
 *
 * @param {import('@playwright/test').Page} page
 */
const exploreBy = (page) => page.getByRole("combobox", { name: "Explore by" });

/**
 * Assert a leaderboard's ranking, treating ties as unordered.
 *
 * Tied entries come out in row order, which the dashboard does not define,
 * so pinning one order couples a test to how the data happens to be sorted.
 * Pass the expected ranking as groups: each inner array is a set of labels
 * that tie, in any order. Only the leading entries covered by the groups are
 * checked. Retries until the list matches, so it is safe right after a
 * change of entity or time window.
 *
 * @param {import('@playwright/test').Locator} labels  The list's label cells
 * @param {string[][]} groups  e.g. [["Rock", "Jazz"], ["Classical"]]
 */
async function expectRanking(labels, groups) {
  const n = groups.reduce((k, g) => k + g.length, 0);
  await expect
    .poll(
      async () => {
        const texts = (await labels.allTextContents()).map((t) => t.trim());
        let i = 0;
        return groups.map((g) => {
          const got = texts.slice(i, (i += g.length));
          return got.length === g.length ? [...got].sort() : got;
        });
      },
      { message: `top ${n} leaderboard entries, ties unordered` },
    )
    .toEqual(groups.map((g) => [...g].sort()));
}

/**
 * Match a leaderboard count cell exactly. Entries that drill down also show a
 * decorative ▶ (aria-hidden) inside the same cell; it and surrounding
 * whitespace are allowed, nothing else is. (A RegExp is matched against the
 * raw text, unlike a string, which Playwright whitespace-normalizes.)
 *
 * @param {string} count  e.g. "4 beers (4.06 avg)"
 */
const countText = (count) =>
  new RegExp(`^\\s*${count.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s*▶)?\\s*$`);

module.exports = { exploreBy, expectRanking, countText };
