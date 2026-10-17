// @ts-check

/**
 * Rewrites a page's data file (static/data/pages/<name>.js) in flight.
 *
 * Big data pages keep their datasets in a separate, preloaded data file
 * instead of inline in the HTML (see _includes/page-data.html). Fixture
 * helpers that used to regex-replace a `const X = [...]` in the page body
 * replace it in that file instead; the declarations are unchanged.
 *
 * Call before page.goto().
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} name  Data file name, e.g. "beer"
 * @param {Array<[RegExp, string]>} replacements  [pattern, replacement] pairs
 */
async function rewritePageData(page, name, replacements) {
  await page.route(`**/static/data/pages/${name}.js*`, async (route) => {
    const response = await route.fetch();
    let body = await response.text();
    for (const [pattern, replacement] of replacements) {
      if (!pattern.test(body)) throw new Error(`page-data ${name}: ${pattern} not found`);
      // Function form so `$` in fixture JSON is never read as a replacement token.
      body = body.replace(pattern, () => replacement);
    }
    await route.fulfill({ response, body });
  });
}

module.exports = { rewritePageData };
