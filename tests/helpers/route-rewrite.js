// @ts-check

/**
 * Rewrite a served response in flight, failing loudly if a pattern misses.
 *
 * Fixture helpers inject data by regex-replacing a `const X = [...]` (or
 * similar) in the page as it is served. A bare String.replace that matches
 * nothing is silent: the page then runs on real data, and any test that only
 * checks that something rendered keeps passing. This throws instead, which
 * fails the test with the pattern in the message.
 *
 * Replacements are applied as functions so `$&`, `$1` and the like inside
 * fixture JSON are never read as replacement tokens.
 *
 * Call before page.goto().
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} glob  URL glob, e.g. "**\/records.html"
 * @param {Array<[RegExp, string]>} replacements  [pattern, replacement] pairs
 */
async function rewriteRoute(page, glob, replacements) {
  await page.route(glob, async (route) => {
    const response = await route.fetch();
    let body = await response.text();
    for (const [pattern, replacement] of replacements) {
      if (!pattern.test(body)) throw new Error(`fixture rewrite of ${glob}: ${pattern} not found`);
      body = body.replace(pattern, () => replacement);
    }
    await route.fulfill({ response, body });
  });
}

module.exports = { rewriteRoute };
