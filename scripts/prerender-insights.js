// @ts-check
/**
 * Prerender the insights dashboards' all-time view into _data/prerendered.json.
 *
 * Data pages build their stat cards, year buttons, entity switcher and
 * leaderboard in JavaScript, after every script and the page's data file
 * have loaded, so on a slow phone the page's largest content appears seconds
 * late and the layout jumps as it fills in. This loads each page from a fresh
 * build with the real dashboard code, takes those parts as rendered for the
 * default (all-time) window, and stores the HTML. _includes/insights/
 * dashboard.html prints it into the page, and the dashboard replaces it with
 * identical markup when it runs, so nothing moves.
 *
 * Re-run after the data changes, like the ETL:
 *   bundle exec jekyll build && npm run prerender
 * tests/prerendered.spec.js fails when a snapshot no longer matches what the
 * dashboard renders.
 *
 * Usage: node scripts/prerender-insights.js [site-dir]   (default: _site)
 */
const fs = require("fs");
const http = require("http");
const path = require("path");
const { chromium } = require("@playwright/test");

const ROOT = path.join(__dirname, "..");
const SITE = path.resolve(process.argv[2] || path.join(ROOT, "_site"));
const OUT = path.join(ROOT, "_data", "prerendered.json");
/** Parts of a dashboard, by element-id suffix, that are deterministic for the all-time window. */
const PARTS = {
  stat_rows: "stat-rows",
  year_buttons: "year-buttons",
  entity_bar: "entity-bar",
  top_list: "top-list",
};

/** Serve the built site with GitHub Pages' URL rules: /x -> /x.html or /x/index.html. */
function serve(root) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const p = decodeURIComponent(new URL(req.url || "/", "http://x").pathname);
      const file = [p, `${p}.html`, path.join(p, "index.html")]
        .map((c) => path.join(root, c))
        .find((f) => fs.existsSync(f) && fs.statSync(f).isFile());
      if (!file) return res.writeHead(404).end();
      const types = {
        ".html": "text/html",
        ".js": "application/javascript",
        ".css": "text/css",
        ".json": "application/json",
      };
      res.writeHead(200, {
        "content-type": types[path.extname(file)] || "application/octet-stream",
      });
      res.end(fs.readFileSync(file));
    });
    server.listen(0, () => resolve(server));
  });
}

/** Built pages that contain a dashboard, as URL paths. */
function dashboardPages(root) {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const f = path.join(dir, e.name);
      if (e.isDirectory()) walk(f);
      else if (
        e.name.endsWith(".html") &&
        /id="[\w-]*stat-rows"/.test(fs.readFileSync(f, "utf8"))
      ) {
        // keep ".html": the test server (python -m http.server) has no extensionless URLs
        out.push("/" + path.relative(root, f).replace(/index\.html$/, ""));
      }
    }
  };
  walk(root);
  return out.sort();
}

(async () => {
  const server = await serve(SITE);
  const base = `http://localhost:${/** @type {any} */ (server.address()).port}`;
  const browser = await chromium.launch();
  // Freeze nothing: the all-time window does not depend on today's date.
  const result = {};
  for (const url of dashboardPages(SITE)) {
    const page = await browser.newPage();
    // Third-party scripts (analytics, CDNs are fine) are irrelevant to the snapshot.
    await page.route(/googletagmanager|google-analytics|disqus/, (r) => r.abort());
    await page.goto(base + url, { waitUntil: "load" });
    const found = await page.evaluate((parts) => {
      const out = {};
      for (const mount of document.querySelectorAll('[id$="stat-rows"]')) {
        const prefix = mount.id.slice(0, -"stat-rows".length);
        // Async-loaded dashboards sit hidden until their data arrives; nothing to prerender.
        if (document.getElementById(prefix + "insights-content")) continue;
        if (!mount.children.length) continue;
        const entry = {};
        for (const [key, suffix] of Object.entries(parts)) {
          const el = document.getElementById(prefix + suffix);
          if (!el) continue;
          // Selection state lives in properties, not attributes; persist it so the
          // served HTML shows the same choice the dashboard makes.
          el.querySelectorAll("option").forEach((o) => o.toggleAttribute("selected", o.selected));
          el.querySelectorAll("input").forEach((i) => i.toggleAttribute("checked", i.checked));
          entry[key] = el.innerHTML.trim();
        }
        // The date-range inputs: an empty month input is wider, so serving them
        // blank made the range row wrap until the dashboard filled them in.
        for (const key of ["range-start", "range-end"]) {
          const input = /** @type {HTMLInputElement | null} */ (
            document.getElementById(prefix + key)
          );
          if (input && input.value) entry[key.replace("-", "_")] = input.value;
        }
        out[prefix] = entry;
      }
      return out;
    }, PARTS);
    for (const [prefix, entry] of Object.entries(found)) {
      if (result[prefix]) throw new Error(`dashboard prefix "${prefix}" appears on two pages`);
      result[prefix] = { page: url, ...entry };
    }
    console.log(`${url}: ${Object.keys(found).join(", ") || "(nothing to prerender)"}`);
    await page.close();
  }
  await browser.close();
  server.close();
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2) + "\n");
  console.log(`wrote ${Object.keys(result).length} dashboards to ${path.relative(ROOT, OUT)}`);
})();
