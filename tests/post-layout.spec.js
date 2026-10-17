// @ts-check

/**
 * Post layout: the two pieces moved out of per-post Liquid for build speed.
 *
 *  - The menu is cached once per post `type` (include_cached keys on its
 *    arguments), so each type must still light up its own writing item, and
 *    two posts of different types must not share one cached menu.
 *  - "Other Posts About <tag>" now renders from _data/related.json
 *    (lib/etl/sources/related.py) instead of walking site.tags live; the
 *    page must show exactly the groups and links that file holds. Every
 *    current post also has a year tag, so the one-tag branch never renders;
 *    lib/tests/sources/test_related.py covers its rules.
 *
 * Runs against the real build, so cases are picked from the real data.
 */

const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");

const ROOT = path.join(__dirname, "..");
const RELATED = JSON.parse(fs.readFileSync(path.join(ROOT, "_data/related.json"), "utf8"));

/** Read a post's front matter `type`, `slug` and URL from its file. */
function postInfo(stem) {
  const text = fs.readFileSync(path.join(ROOT, "_posts", `${stem}.md`), "utf8");
  const fm = text.split("---")[1];
  const field = (k) => (fm.match(new RegExp(`^${k}:\\s*(.+)$`, "m")) || [])[1]?.trim();
  const slug = field("slug") || stem.replace(/^\d{4}-\d{1,2}-\d{1,2}-/, "");
  return { stem, type: field("type"), url: `/posts/${slug}/` };
}

const ALL = Object.keys(RELATED)
  .filter((k) => k !== "last_updated")
  .map(postInfo);

const firstOf = (pred) => {
  const hit = ALL.find(pred);
  if (!hit) throw new Error("no post matches");
  return hit;
};

const ACTIVE_ITEM = {
  article: "articles & essays",
  essay: "articles & essays",
  notes: "notes & lists",
  list: "notes & lists",
  stub: "all",
};

test.describe("menu, cached per post type", () => {
  for (const [type, label] of Object.entries(ACTIVE_ITEM)) {
    test(`a ${type} post marks "${label}" and the writing menu active`, async ({ page }) => {
      const post = firstOf((p) => p.type === type);
      await page.goto(post.url);
      await expect(page.getByRole("button", { name: "my writing", exact: true })).toHaveClass(
        /\bactive\b/,
      );
      const active = page.locator(".dropdown-menu .dropdown-item.active");
      await expect(active).toHaveCount(1);
      await expect(active).toHaveText(label);
    });
  }

  test("posts of different types do not share a cached menu", async ({ page }) => {
    const article = firstOf((p) => p.type === "article");
    const notes = firstOf((p) => p.type === "notes");
    await page.goto(article.url);
    const a = await page.locator("nav").first().innerHTML();
    await page.goto(notes.url);
    const n = await page.locator("nav").first().innerHTML();
    expect(a).not.toBe(n);
  });
});

test.describe("related posts from _data/related.json", () => {
  const cases = {
    "a multi-tag post with several groups": (r) => !r.single && r.groups.length >= 2,
    "a post with no related groups": (r) => r.groups.length === 0,
  };

  for (const [name, pred] of Object.entries(cases)) {
    test(`${name} renders exactly its groups and links`, async ({ page }) => {
      const post = ALL.find((p) => pred(RELATED[p.stem]));
      if (!post) throw new Error(`no ${name} in the current data`);
      const entry = RELATED[post.stem];
      await page.goto(post.url);

      const headings = page.locator("h2", { hasText: "Other Posts About" });
      await expect(headings).toHaveCount(entry.groups.length);
      for (const [i, group] of entry.groups.entries()) {
        await expect(headings.nth(i)).toContainText(group.tag);
        const block = entry.single ? page.locator("article ~ *") : page.locator(".row .col").nth(i);
        for (const p of group.posts) {
          await expect(block.locator(`a[href="${p.url}"]`).first()).toHaveText(p.title);
        }
      }
    });
  }
});
