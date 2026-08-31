"""Tests for the backlinks reverse index, focused on thoughts (ADR-0001).

Thoughts are indexed on BOTH sides, and the two sides use different
mechanisms — which is the whole reason these tests exist:

  as a SOURCE  a thought references a post with `{% post_url %}`, exactly
               like a post or a page does.
  as a TARGET  nothing can reference a thought with `{% post_url %}`,
               because that tag resolves posts only. Inbound links to one are
               plain `/thought/<slug>/` hrefs, matched by a separate regex.

The target side is the fragile one: it is the only place in this ETL that
matches a bare URL rather than a Liquid tag, so it is the only place that can
silently over-match. The cases below pin down what it must NOT catch — the
/thought/ index, feed.xml, an unknown slug, and a note linking to itself.
"""

from __future__ import annotations

import pytest

from lib.etl import config
from lib.etl.sources.backlinks import generate_backlinks

from .conftest import load_output


def _write(path, frontmatter_lines: list[str], body: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fm = "\n".join(frontmatter_lines)
    path.write_text(f"---\n{fm}\n---\n\n{body}\n", encoding="utf-8")


@pytest.fixture()
def site(tmp_path, monkeypatch):
    """A miniature site: one post, two thoughts, one page."""
    out = tmp_path / "_data"
    out.mkdir()
    monkeypatch.setattr(config, "SITE_ROOT", str(tmp_path))
    monkeypatch.setattr(config, "OUTPUT_DATA_DIR", str(out))

    _write(
        tmp_path / "_posts" / "2024-01-01-A-Real-Post.md",
        ["title: A Real Post", "slug: a-real-post"],
        "A post that links to a thought: [see](/thought/first-note/).",
    )
    _write(
        tmp_path / "_thought" / "first-note.md",
        ["title: First Note", "slug: first-note", "maturity: seedling"],
        "This note cites {% post_url 2024-01-01-A-Real-Post %} and links "
        "to [itself](/thought/first-note/), which must not count.",
    )
    _write(
        tmp_path / "_thought" / "second-note.md",
        ["title: Second Note", "slug: second-note", "maturity: budding"],
        "Links to [the first](/thought/first-note/), to the "
        "[index](/thought/), to the [feed](/thought/feed.xml) and to a "
        "[dead slug](/thought/does-not-exist/).",
    )
    _write(
        tmp_path / "pages" / "writing" / "an-anthology.md",
        ["title: An Anthology", "permalink: /anthologies/an-anthology/"],
        "Anthologies link to notes too: [first](/thought/first-note/).",
    )
    return tmp_path, out


def test_thought_is_indexed_as_a_source_of_post_links(site):
    _, out = site
    generate_backlinks()
    data = load_output(out, "backlinks")

    refs = data["2024-01-01-A-Real-Post"]["links_here"]
    assert {"url": "/thought/first-note/", "title": "First Note"} in refs


def test_thought_accumulates_inbound_links_from_every_source_kind(site):
    _, out = site
    generate_backlinks()
    data = load_output(out, "backlinks")

    entry = data["first-note"]
    assert {"url": "/posts/a-real-post/", "title": "A Real Post"} in entry["links_here"]
    assert {"url": "/thought/second-note/", "title": "Second Note"} in entry["links_here"]

    # A page still lands in its classified bucket, not links_here.
    assert {
        "url": "/anthologies/an-anthology/",
        "title": "An Anthology",
    } in entry["anthologies"]


def test_a_thought_linking_to_itself_is_not_a_backlink(site):
    _, out = site
    generate_backlinks()
    data = load_output(out, "backlinks")

    urls = [r["url"] for r in data["first-note"]["links_here"]]
    assert "/thought/first-note/" not in urls


@pytest.mark.parametrize("phantom", ["does-not-exist", "feed.xml", ""])
def test_index_feed_and_dead_slugs_never_become_targets(site, phantom):
    _, out = site
    generate_backlinks()
    data = load_output(out, "backlinks")

    assert phantom not in data


def test_second_note_has_no_inbound_links(site):
    """Nothing links to it — it must be absent, not present-and-empty."""
    _, out = site
    generate_backlinks()
    data = load_output(out, "backlinks")

    assert "second-note" not in data


def test_posts_still_index_normally_without_any_thoughts(tmp_path, monkeypatch):
    """Thoughts are additive: a site with no _thought/ must behave as before."""
    out = tmp_path / "_data"
    out.mkdir()
    monkeypatch.setattr(config, "SITE_ROOT", str(tmp_path))
    monkeypatch.setattr(config, "OUTPUT_DATA_DIR", str(out))

    _write(
        tmp_path / "_posts" / "2024-01-01-Target.md",
        ["title: Target", "slug: target"],
        "nothing here",
    )
    _write(
        tmp_path / "_posts" / "2024-02-01-Source.md",
        ["title: Source", "slug: source"],
        "cites {% post_url 2024-01-01-Target %}",
    )

    generate_backlinks()
    data = load_output(out, "backlinks")

    assert data["2024-01-01-Target"]["links_here"] == [
        {"url": "/posts/source/", "title": "Source"}
    ]
