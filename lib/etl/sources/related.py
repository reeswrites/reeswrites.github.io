"""Precompute the "Other Posts About <tag>" blocks under each post.

``_layouts/post.html`` used to build these live from ``site.tags``: for every
post, for every tag, size and slice that tag's post list and read each post's
title, URL and description. Those are Jekyll document drops, which are slow to
touch, and the walk cost about a second of every build. This writes the same
result to ``_data/related.json`` so the layout only loops over plain data.

It mirrors what the layout did, rule for rule:

  * ``site.tags[tag]`` holds published, non-future posts with that tag,
    newest first (Jekyll sorts by date, then path, and reverses).
  * One tag: show up to 5 posts from it, if it has more than one post.
  * Several tags: skip year tags (starting with "20") and tags with a single
    post; show up to 4 posts per remaining tag, side by side. Draw the
    divider above them when the non-year tags hold more posts than the post
    has tags.
  * The post itself is dropped from its own lists by title, inside the
    limit, so a list can show one fewer.

Keyed by the dated filename stem, like ``backlinks.json``, which the layout
looks up through its ``filename`` variable. Re-run after adding or retagging
posts: a post missing from the file simply shows no related posts.
"""

from __future__ import annotations

import logging
import re
from datetime import date
from pathlib import Path
from urllib.parse import quote

import frontmatter

from .. import config, io

_DATED_STEM_RE = re.compile(r"^(\d{4})-(\d{1,2})-(\d{1,2})-(.+)$")

# Jekyll's Utils.slugify(mode: "pretty", cased: true): keep alphanumerics and
# ._~!$&'()+,;=@, collapse every other run into "-", trim edge hyphens.
# Ruby's [:alnum:] excludes "_", unlike Python's \w, hence the alternation.
_PRETTY_SLUG_RE = re.compile(r"(?:[^\w._~!$&'()+,;=@]|_)+")

SINGLE_TAG_LIMIT = 5
MULTI_TAG_LIMIT = 4


def jekyll_pretty_slug(text: str) -> str:
    return _PRETTY_SLUG_RE.sub("-", text).strip("-")


def post_url(slug: str) -> str:
    """URL for the site's ``/posts/:title/`` permalink, escaped like Jekyll's."""
    return "/posts/" + quote(jekyll_pretty_slug(slug), safe="-._~!$&'()*+,;=:@") + "/"


def _jekyll_tags(value) -> list[str]:
    """Normalize front matter tags the way Jekyll does: a string splits on
    whitespace, nested lists flatten, and empty entries drop out."""
    if value is None:
        return []
    if isinstance(value, str):
        return value.split()
    out: list[str] = []
    for item in value if isinstance(value, list) else [value]:
        out.extend(
            _jekyll_tags(item)
            if isinstance(item, list)
            else ([] if item is None else [str(item)])
        )
    return out


def _load_posts(posts_dir: Path, today: date) -> list[dict]:
    posts = []
    for path in sorted(posts_dir.glob("*.md")):
        m = _DATED_STEM_RE.match(path.stem)
        if not m:
            continue
        posted = date(int(m[1]), int(m[2]), int(m[3]))
        doc = frontmatter.load(str(path))
        if doc.get("published") is False or posted > today:
            continue
        slug = str(doc.get("slug") or m[4])
        tags = _jekyll_tags(doc.get("tags"))
        posts.append(
            {
                "stem": path.stem,
                "path": str(path),
                "date": posted,
                # untitled: Jekyll titleizes the filename slug, not front matter
                "title": str(
                    doc.get("title")
                    or " ".join(w.capitalize() for w in m[4].split("-"))
                ),
                "url": post_url(slug),
                "description": doc.get("description"),
                "tags": tags,
            }
        )
    return posts


def build_related(posts: list[dict]) -> dict[str, dict]:
    """Map each post's stem to the related-post blocks its layout shows."""
    by_tag: dict[str, list[dict]] = {}
    for p in sorted(posts, key=lambda p: (p["date"], p["path"]), reverse=True):
        for t in p["tags"]:
            by_tag.setdefault(t, []).append(p)

    def group(tag: str, limit: int, own_title: str) -> dict:
        shown = [p for p in by_tag[tag][:limit] if p["title"] != own_title]
        return {
            "tag": tag,
            "posts": [
                {"title": p["title"], "url": p["url"], "description": p["description"]}
                for p in shown
            ],
        }

    related: dict[str, dict] = {}
    for p in posts:
        tags = p["tags"]
        if len(tags) == 1:
            tag = tags[0]
            groups = (
                [group(tag, SINGLE_TAG_LIMIT, p["title"])]
                if len(by_tag.get(tag, [])) > 1
                else []
            )
            related[p["stem"]] = {"single": True, "groups": groups}
            continue
        topical = [t for t in tags if not t.startswith("20")]
        total = sum(len(by_tag.get(t, [])) for t in topical)
        related[p["stem"]] = {
            "single": False,
            "hr": total > len(tags),
            "groups": [
                group(t, MULTI_TAG_LIMIT, p["title"])
                for t in topical
                if len(by_tag.get(t, [])) > 1
            ],
        }
    return related


def generate_related() -> None:
    """Build ``_data/related.json`` from ``_posts/``."""
    posts = _load_posts(Path(config.SITE_ROOT) / "_posts", date.today())
    related = build_related(posts)
    logging.info(
        "related: %d posts, %d with related posts",
        len(related),
        sum(1 for r in related.values() if r["groups"]),
    )
    io.save_formatted_data("related", related)
