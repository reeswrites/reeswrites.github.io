// @ts-check
const { defineConfig, devices } = require("@playwright/test");

/**
 * Playwright configuration for graph-view characterization tests.
 *
 * webServer strategy:
 *   1. `bundle exec jekyll build` produces _site/ (production-identical output,
 *      data inlined via Liquid, no livereload noise).
 *   2. `python3 -m http.server` serves _site/ on :4000 with no extra deps.
 *      Trailing-slash URLs (/posts/graph/) resolve to _site/posts/graph/index.html.
 *
 * Tests inject a frozen fixture over window.GRAPH_DATA before any page JS runs,
 * so the full site can be built once and reused across runs (reuseExistingServer).
 */
module.exports = defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: { timeout: 8_000 },

  workers: 8,
  fullyParallel: true,

  /* Single Chromium project — the graph uses canvas + D3, so one browser is enough. */
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        permissions: ["clipboard-read", "clipboard-write"],
      },
    },
  ],

  use: {
    baseURL: "http://localhost:4000",
    /* Capture traces on first retry to diagnose CI failures. */
    trace: "on-first-retry",
  },

  webServer: {
    /* Build once, then serve the static output. Jekyll build typically takes ~10s. */
    command:
      "bundle exec jekyll build && python3 -m http.server 4000 --directory _site",
    url: "http://localhost:4000/posts/graph/",
    /* Reuse a running server in local dev; always fresh on CI. */
    timeout: 120_000,
  },
});
