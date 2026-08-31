"""Tests for link extraction in jekyll_tools.py."""

from __future__ import annotations

import sys
import types

# jekyll_tools imports git_tools at module level; stub it
_git_tools = types.ModuleType("git_tools")
_git_tools.get_publish_date = lambda *a, **kw: None  # type: ignore[attr-defined]
sys.modules["git_tools"] = _git_tools

from lib import jekyll_tools
from lib.jekyll_tools import extract_links


def _write_post(content: str, tmp_path) -> str:
    path = tmp_path / "2026-08-28-test-post.md"
    path.write_text(content, encoding="utf-8")

    return str(path)


def test_media_embeds_count_as_external_links(tmp_path, monkeypatch):
    def _no_network(*args, **kwargs):
        raise AssertionError("an embed's title comes from the include, not the network")

    monkeypatch.setattr(jekyll_tools.requests, "get", _no_network)
    monkeypatch.setattr(jekyll_tools, "_build_citation_title_map", lambda: {})

    post = _write_post(
        "---\ntitle: x\n---\n\n"
        '{% include embed.html provider="youtube" id="e1cg0jPrBDw" '
        'url="https://www.youtube.com/watch?v=e1cg0jPrBDw" '
        'title="Show Us Your Bed | #38 — Interior Motives" %}\n\n'
        '{% include embed.html provider="tiktok" id="7671029342163438868" '
        'url="https://www.tiktok.com/@kiki/video/7671029342163438868" '
        'title="START THE SUBSTACK — @storieswithkiki" %}\n',
        tmp_path,
    )

    links = extract_links(post)

    assert links["external"] == [
        {
            "url": "https://www.youtube.com/watch?v=e1cg0jPrBDw",
            "title": "Show Us Your Bed | #38 — Interior Motives",
        },
        {
            "url": "https://www.tiktok.com/@kiki/video/7671029342163438868",
            "title": "START THE SUBSTACK — @storieswithkiki",
        },
    ]
    assert links["internal"] == []
    assert links["citations"] == []


def test_an_embed_without_a_url_is_not_a_link(tmp_path, monkeypatch):
    monkeypatch.setattr(jekyll_tools, "_build_citation_title_map", lambda: {})

    post = _write_post(
        "---\ntitle: x\n---\n\n"
        '{% include embed.html provider="youtube" id="abc123" title="No url" %}\n',
        tmp_path,
    )

    assert extract_links(post)["external"] == []


def test_a_url_with_parentheses_is_not_cut_short(tmp_path, monkeypatch):
    class _Response:
        text = "<html><head><title>Quine (computing) - Wikipedia</title></head></html>"

        def raise_for_status(self):
            return None

    fetched: list[str] = []

    def _get(url, **kwargs):
        fetched.append(url)

        return _Response()

    monkeypatch.setattr(jekyll_tools.requests, "get", _get)
    monkeypatch.setattr(jekyll_tools, "_build_citation_title_map", lambda: {})

    post = _write_post(
        "---\ntitle: x\n---\n\n"
        "[Quines](https://en.wikipedia.org/wiki/Quine_(computing))\n",
        tmp_path,
    )

    links = extract_links(post)

    assert fetched == ["https://en.wikipedia.org/wiki/Quine_(computing)"]
    assert links["external"] == [
        {
            "url": "https://en.wikipedia.org/wiki/Quine_(computing)",
            "title": "Quine (computing) - Wikipedia",
        }
    ]
