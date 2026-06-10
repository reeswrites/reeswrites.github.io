"""Tests for the media citation extraction in jekyll_tools.py."""

from __future__ import annotations

import json
import sys
import types

# jekyll_tools imports git_tools at module level; stub it
_git_tools = types.ModuleType("git_tools")
_git_tools.get_publish_date = lambda *a, **kw: None  # type: ignore[attr-defined]
sys.modules["git_tools"] = _git_tools

from lib.jekyll_tools import (
    CITABLE_PAGES,
    extract_citations,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _write_post(content: str, tmp_path) -> str:
    """Write a temp .md file and return its path."""
    p = tmp_path / "test-post.md"
    p.write_text(content)
    return str(p)


def _write_media_json(tmp_path, movies=None, books=None, tv=None) -> None:
    """Write minimal _data/media/*.json files and monkeypatch Path so the loader finds them."""
    media_dir = tmp_path / "_data" / "media"
    media_dir.mkdir(parents=True)
    if movies is not None:
        (media_dir / "movies.json").write_text(json.dumps({"watched": movies}))
    if books is not None:
        (media_dir / "books.json").write_text(json.dumps({"read": books}))
    if tv is not None:
        (media_dir / "tv.json").write_text(json.dumps({"shows": tv}))


# ---------------------------------------------------------------------------
# CITABLE_PAGES
# ---------------------------------------------------------------------------


class TestCitablePages:
    def test_has_movies(self):
        assert "movies" in CITABLE_PAGES
        assert CITABLE_PAGES["movies"] == "movie"

    def test_has_books_read(self):
        assert "books-read" in CITABLE_PAGES
        assert CITABLE_PAGES["books-read"] == "book"

    def test_has_tv(self):
        assert "tv" in CITABLE_PAGES
        assert CITABLE_PAGES["tv"] == "tv"


# ---------------------------------------------------------------------------
# extract_citations
# ---------------------------------------------------------------------------


class TestExtractCitations:
    """Test citation extraction from post markdown."""

    _TITLE_MAP = {
        "movies:496243": "Parasite",
        "books-read:0226112306": "Some Book",
        "tv:1399": "Game of Thrones",
    }

    def test_movie_citation(self, tmp_path):
        path = _write_post(
            "---\ntitle: Test\n---\nI loved [Parasite](/data/movies?item=496243).\n",
            tmp_path,
        )
        cits = extract_citations(path, self._TITLE_MAP)
        assert len(cits) == 1
        assert cits[0] == {
            "url": "/data/movies?item=496243",
            "title": "Parasite",
            "type": "movie",
            "id": "496243",
        }

    def test_book_citation(self, tmp_path):
        path = _write_post(
            "---\ntitle: T\n---\nSee [book](/data/books-read?item=0226112306).\n",
            tmp_path,
        )
        cits = extract_citations(path, self._TITLE_MAP)
        assert len(cits) == 1
        assert cits[0]["type"] == "book"
        assert cits[0]["id"] == "0226112306"
        assert cits[0]["title"] == "Some Book"

    def test_unknown_id_included_without_title(self, tmp_path):
        """An id not in the title map still produces a citation entry (dangling — warn at embed time)."""
        path = _write_post(
            "---\ntitle: T\n---\n[Ghost](/data/movies?item=999999).\n",
            tmp_path,
        )
        cits = extract_citations(path, self._TITLE_MAP)
        assert len(cits) == 1
        assert cits[0]["id"] == "999999"
        assert cits[0]["title"] == ""  # no title found

    def test_external_link_not_classified(self, tmp_path):
        path = _write_post(
            "---\ntitle: T\n---\n[Google](https://google.com).\n",
            tmp_path,
        )
        cits = extract_citations(path, self._TITLE_MAP)
        assert cits == []

    def test_post_url_not_classified(self, tmp_path):
        path = _write_post(
            "---\ntitle: T\n---\n[See post]({% post_url 2024-01-01-something %}).\n",
            tmp_path,
        )
        cits = extract_citations(path, self._TITLE_MAP)
        assert cits == []

    def test_image_not_classified(self, tmp_path):
        path = _write_post(
            '---\ntitle: T\n---\n![Poster](/data/movies?item=496243 "alt").\n',
            tmp_path,
        )
        cits = extract_citations(path, self._TITLE_MAP)
        assert cits == []

    def test_non_citable_page_not_classified(self, tmp_path):
        """A /data/ link for a page not in CITABLE_PAGES is ignored."""
        path = _write_post(
            "---\ntitle: T\n---\n[Beer](/data/beer?item=12345).\n",
            tmp_path,
        )
        cits = extract_citations(path, self._TITLE_MAP)
        assert cits == []

    def test_multiple_citations(self, tmp_path):
        path = _write_post(
            "---\ntitle: T\n---\n"
            "[Movie](/data/movies?item=496243) and [TV](/data/tv?item=1399).\n",
            tmp_path,
        )
        cits = extract_citations(path, self._TITLE_MAP)
        assert len(cits) == 2
        types_ = {c["type"] for c in cits}
        assert types_ == {"movie", "tv"}

    def test_dedup_same_citation_twice(self, tmp_path):
        """Same citation appearing twice in a post should appear twice (dedup is embed.py's job)."""
        path = _write_post(
            "---\ntitle: T\n---\n[Parasite](/data/movies?item=496243) and again [Parasite](/data/movies?item=496243).\n",
            tmp_path,
        )
        cits = extract_citations(path, self._TITLE_MAP)
        assert len(cits) == 2
