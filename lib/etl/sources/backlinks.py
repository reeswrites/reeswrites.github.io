"""Precompute reverse backlinks index for posts.

Scans ``_posts/*.md`` and ``pages/**/*.{md,html}`` for
``{% post_url <FILENAME> %}`` references and builds a reverse index keyed
by the target post's dated filename stem (e.g. ``2022-05-05-My-CS-Degree``).

The ``_layouts/post.html`` template looks up this key via the ``filename``
variable (``page.path | remove: "_posts/" | remove: ".md"``), replacing an
O(n²) live Liquid scan (~110k content checks) with an O(1) dict lookup.

Each entry has three buckets:

  anthologies   – pages whose URL contains ``/anthologies``
  big_questions – pages whose URL contains ``/about-big-questions``
  links_here    – all other pages and posts that reference this post
"""

from __future__ import annotations

import logging
import re
from pathlib import Path

import frontmatter

from .. import config, io

# Matches: {% post_url 2022-05-05-Some-Post-Title %}
# Handles filenames with commas, hyphens, underscores, dots, digits, and letters.
_POST_URL_RE = re.compile(r"\{%-?\s*post_url\s+([\w,.-]+)\s*-?%\}")


def _classify_url(url: str) -> str | None:
    """Return the bucket name for a referencing page URL, or None to skip."""
    if not url or ".json" in url:
        return None
    if "/anthologies" in url:
        return "anthologies"
    if "/about-big-questions" in url:
        return "big_questions"
    return "links_here"


def generate_backlinks() -> None:
    """Build ``_data/backlinks.json`` reverse-link index."""
    root = Path(config.SITE_ROOT)

    # ── Build target set: all dated post filename stems ──────────────────────
    post_stems: set[str] = {p.stem for p in (root / "_posts").glob("*.md")}

    # ── Reverse index: stem → {anthologies, big_questions, links_here} ───────
    reverse: dict[str, dict[str, list[dict]]] = {}

    def _add(target: str, bucket: str, ref: dict) -> None:
        entry = reverse.setdefault(
            target, {"anthologies": [], "big_questions": [], "links_here": []}
        )
        if not any(x["url"] == ref["url"] for x in entry[bucket]):
            entry[bucket].append(ref)

    # ── Scan posts (always go to links_here bucket) ───────────────────────────
    for post_path in sorted((root / "_posts").glob("*.md")):
        try:
            doc = frontmatter.load(str(post_path))
        except Exception:
            continue
        title = str(doc.get("title") or post_path.stem)
        slug = str(doc.get("slug") or "")
        if not slug:
            slug = re.sub(r"^\d{4}-\d{1,2}-\d{1,2}-", "", post_path.stem)
        url = f"/posts/{slug}/"
        for m in _POST_URL_RE.finditer(doc.content):
            target = m.group(1)
            if target in post_stems:
                _add(target, "links_here", {"url": url, "title": title})

    # ── Scan pages (classified by URL) ────────────────────────────────────────
    pages_dir = root / "pages"
    for page_path in sorted(
        list(pages_dir.rglob("*.md")) + list(pages_dir.rglob("*.html"))
    ):
        try:
            doc = frontmatter.load(str(page_path))
        except Exception:
            continue
        title = str(doc.get("title") or page_path.stem)
        url = str(doc.get("permalink") or "").strip()
        bucket = _classify_url(url)
        if bucket is None:
            continue
        for m in _POST_URL_RE.finditer(doc.content):
            target = m.group(1)
            if target in post_stems:
                _add(target, bucket, {"url": url, "title": title})

    n_targets = len(reverse)
    n_refs = sum(
        len(v["anthologies"]) + len(v["big_questions"]) + len(v["links_here"])
        for v in reverse.values()
    )
    logging.info(
        "backlinks: %d posts with inbound links, %d total references",
        n_targets,
        n_refs,
    )
    io.save_formatted_data("backlinks", reverse)
