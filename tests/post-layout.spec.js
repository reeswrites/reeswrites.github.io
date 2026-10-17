// @ts-check

/**
 * Post layout: the two pieces moved out of per-post Liquid for build speed.
 *
 *  - The menu is cached once per post `type` (include_cached keys on its
 *    arguments), so each type must still light up its own writing item. If
 *    all posts shared one cached menu, the per-type cases below disagree.
 *  - "Other Posts About <tag>" renders from _data/related.json. This spec
 *    checks the RENDERING of that file: every group, link, description and
 *    the divider, with nothing extra. Whether the file itself is right is
 *    lib/tests/sources/test_related.py's job (the rules) and was checked once
 *    against the old live-Liquid output by diffing the whole built site.
 *
 * Runs against the real build, so cases are picked from the real data and a
 * case with no example in it fails rather than skips.
 */

const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");

const ROOT = path.join(__dirname, "..");
const RELATED = JSON.parse(fs.readFileSync(path.join(ROOT, "_data/related.json"), "utf8"));

/** A post's front matter `type` and URL, read from its file. */
function postInfo(stem) {
  const fm = fs.readFileSync(path.join(ROOT, "_posts", `${stem}.md`), "utf8").split("---")[1];
  const field = (k) => (fm.match(new RegExp(`^${k}:\\s*(.+)$`, "m")) || [])[1]?.trim();
  const slug = field("slug") || stem.replace(/^\d{4}-\d{1,2}-\d{1,2}-/, "");
  return { stem, type: field("type"), url: `/posts/${slug}/` };
}

const ALL = Object.keys(RELATED)
  .filter((k) => k !== "last_updated")
  .map(postInfo);

function firstPost(pred, what) {
  const hit = ALL.find(pred);
  if (!hit) throw new Error(`no ${what} in the current data`);
  return hit;
}

/** Post type → the one "my writing" item it marks active (null: none). */
const ACTIVE_ITEM = {
  article: "articles & essays",
  essay: "articles & essays",
  notes: "notes & lists",
  list: "notes & lists",
  stub: "all",
  project: null, // the writing menu has no projects item
};

test.describe("menu, cached per post type", () => {
  for (const [type, label] of Object.entries(ACTIVE_ITEM)) {
    test(`a ${type} post marks ${label ? `"${label}"` : "no item"} and the writing menu active`, async ({
      page,
    }) => {
      await page.goto(firstPost((p) => p.type === type, `${type} post`).url);
      await expect(page.getByRole("button", { name: "my writing", exact: true })).toHaveClass(
        /\bactive\b/,
      );
      const active = page.locator(".dropdown-menu .dropdown-item.active");
      if (label) {
        await expect(active).toHaveCount(1);
        await expect(active).toHaveText(label);
      } else {
        await expect(active).toHaveCount(0);
      }
    });
  }
});

/**
 * What the related section of a post shows: per heading, its tag and the
 * (url, title, description) of each link under it, plus whether a divider
 * precedes it.
 */
async function renderedRelated(page) {
  return page.evaluate(() => {
    const headings = [...document.querySelectorAll("h2")].filter((h) =>
      h.textContent.startsWith("Other Posts About"),
    );
    return headings.map((h) => {
      const scope = h.closest(".col") || h.parentElement;
      const links = [];
      let el = h.nextElementSibling;
      while (el && el.tagName !== "H2" && el.tagName !== "HR") {
        const a = el.querySelector("a");
        if (a) {
          const desc = el.nextElementSibling;
          links.push({
            url: a.getAttribute("href"),
            title: a.textContent.trim(),
            description: desc.textContent.trim(),
          });
          el = desc.nextElementSibling;
        } else {
          el = el.nextElementSibling;
        }
      }
      return {
        tag: h.querySelector("em").textContent,
        inColumn: scope.classList.contains("col"),
        links,
      };
    });
  });
}

const dividerBeforeRow = (page) =>
  page.evaluate(
    () => document.querySelector("section#content .row")?.previousElementSibling?.tagName === "HR",
  );

test.describe("related posts render related.json faithfully", () => {
  const cases = {
    "a post with several related groups": (r) => !r.single && r.groups.length >= 2,
    "a post with one related group": (r) => !r.single && r.groups.length === 1,
    "a post with no related groups": (r) => r.groups.length === 0,
  };

  for (const [name, pred] of Object.entries(cases)) {
    test(`${name}: exactly its groups, links, descriptions and divider`, async ({ page }) => {
      const post = firstPost((p) => pred(RELATED[p.stem]), name);
      const entry = RELATED[post.stem];
      await page.goto(post.url);

      expect(await renderedRelated(page)).toEqual(
        entry.groups.map((g) => ({
          tag: g.tag,
          inColumn: true,
          links: g.posts.map((p) => ({
            url: p.url,
            title: p.title,
            description: p.description ?? "",
          })),
        })),
      );
      expect(await dividerBeforeRow(page)).toBe(entry.hr);
    });
  }
});
