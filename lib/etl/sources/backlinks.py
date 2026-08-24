"""Precompute reverse backlinks index for posts.

Scans ``_posts/*.md``, ``pages/**/*.{md,html}`` and ``_garden/*.md`` for
``{% post_url <FILENAME> %}`` references and builds a reverse index keyed
by the target post's dated filename stem (e.g. ``2022-05-05-My-CS-Degree``).

The ``_layouts/post.html`` template looks up this key via the ``filename``
variable (``page.path | remove: "_posts/" | remove: ".md"``), replacing an
O(n²) live Liquid scan (~110k content checks) with an O(1) dict lookup.

**Garden notes (ADR-0001) are indexed on both sides.** As a *source* they use
``{% post_url %}`` like anything else. As a *target* they cannot: ``post_url``
resolves posts only, so a link to a garden note is a plain ``/garden/<slug>/``
href, and those are matched separately by ``_GARDEN_URL_RE``. Garden targets are
keyed by their own stem, which ``_layouts/garden.html`` looks up the same way
(``page.path | remove: "_garden/" | remove: ".md"``). Without this a garden note
could never accumulate inbound links, which is most of what makes a garden a
garden rather than a pile.

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

# Matches a link to a garden note: /garden/some-slug/ (trailing slash optional).
# Anchored on the leading slash so it cannot match the /garden/ index itself,
# an absolute URL on another host, or /garden/feed.xml.
_GARDEN_URL_RE = re.compile(r"(?<!\w)/garden/([a-z0-9][a-z0-9-]*)/?(?=[\s\"')\]#?]|$)", re.I)


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

    # ── Build target set: garden notes, keyed by slug (their URL segment) ────
    garden_dir = root / "_garden"
    garden_slugs: dict[str, str] = {}
    for g in garden_dir.glob("*.md"):
        try:
            gdoc = frontmatter.load(str(g))
        except Exception:
            continue
        garden_slugs[str(gdoc.get("slug") or g.stem)] = g.stem

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

    # ── Scan garden notes as SOURCES (ADR-0001) ─────────────────────────────
    for note_path in sorted(garden_dir.glob("*.md")):
        try:
            doc = frontmatter.load(str(note_path))
        except Exception:
            continue
        title = str(doc.get("title") or note_path.stem)
        slug = str(doc.get("slug") or note_path.stem)
        url = f"/garden/{slug}/"
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

    # ── Scan everything for links TO garden notes (plain-URL, not post_url) ──
    sources: list[tuple[Path, str]] = (
        [(p, "post") for p in sorted((root / "_posts").glob("*.md"))]
        + [(p, "page") for p in sorted(
            list(pages_dir.rglob("*.md")) + list(pages_dir.rglob("*.html"))
        )]
        + [(p, "garden") for p in sorted(garden_dir.glob("*.md"))]
    )
    for src_path, kind in sources:
        try:
            doc = frontmatter.load(str(src_path))
        except Exception:
            continue
        title = str(doc.get("title") or src_path.stem)
        if kind == "post":
            slug = str(doc.get("slug") or "")
            if not slug:
                slug = re.sub(r"^\d{4}-\d{1,2}-\d{1,2}-", "", src_path.stem)
            url = f"/posts/{slug}/"
            bucket = "links_here"
        elif kind == "garden":
            url = f"/garden/{doc.get('slug') or src_path.stem}/"
            bucket = "links_here"
        else:
            url = str(doc.get("permalink") or "").strip()
            bucket = _classify_url(url) or ""
            if not bucket:
                continue

        for m in _GARDEN_URL_RE.finditer(doc.content):
            target_stem = garden_slugs.get(m.group(1))
            # A note never links to itself, and an unresolved slug is a dead link
            # we deliberately do not index rather than invent an entry for.
            if target_stem and target_stem != src_path.stem:
                _add(target_stem, bucket, {"url": url, "title": title})

    n_targets = len(reverse)
    n_refs = sum(
        len(v["anthologies"]) + len(v["big_questions"]) + len(v["links_here"])
        for v in reverse.values()
    )
    logging.info(
        "backlinks: %d targets with inbound links, %d total references",
        n_targets,
        n_refs,
    )
    io.save_formatted_data("backlinks", reverse)
