"""Tests for promote_draft slug-matching logic in jekyll_tools."""

from __future__ import annotations

import argparse
import sys
import types

import pytest

_git_tools = types.ModuleType("git_tools")
_git_tools.get_publish_date = lambda *a, **kw: None  # type: ignore[attr-defined]
sys.modules.setdefault("git_tools", _git_tools)

_embed = types.ModuleType("embed")
_embed.main = lambda: None  # type: ignore[attr-defined]
sys.modules.setdefault("embed", _embed)

_backlinks_mod = types.ModuleType("etl.sources.backlinks")
_backlinks_mod.generate_backlinks = lambda: None  # type: ignore[attr-defined]
sys.modules.setdefault("etl", types.ModuleType("etl"))
sys.modules.setdefault("etl.sources", types.ModuleType("etl.sources"))
sys.modules.setdefault("etl.sources.backlinks", _backlinks_mod)

from lib import jekyll_tools


def _make_args(slug=None):
    ns = argparse.Namespace()
    ns.slug = slug
    return ns


@pytest.fixture()
def drafts_dir(tmp_path, monkeypatch):
    d = tmp_path / "_drafts"
    d.mkdir()
    p = tmp_path / "_posts"
    p.mkdir()
    monkeypatch.setattr(jekyll_tools, "draft_directory", str(d))
    monkeypatch.setattr(jekyll_tools, "post_directory", str(p))
    return d, p


def _write_draft(directory, filename, title, slug=None):
    fm = f"---\ntitle: {title}\n"
    if slug:
        fm += f"slug: {slug}\n"
    fm += "---\nBody text.\n"
    (directory / filename).write_text(fm)


class TestFindDraftBySlug:
    def test_matches_filename_stem(self, drafts_dir):
        d, _ = drafts_dir
        _write_draft(d, "My-Great-Post.md", "My Great Post")
        result = jekyll_tools._find_draft_by_slug(["My-Great-Post.md"], "my-great-post")
        assert result == "My-Great-Post.md"

    def test_matches_frontmatter_slug(self, drafts_dir):
        d, _ = drafts_dir
        _write_draft(d, "My-Great-Post.md", "My Great Post", slug="great-post")
        result = jekyll_tools._find_draft_by_slug(["My-Great-Post.md"], "great-post")
        assert result == "My-Great-Post.md"

    def test_returns_none_on_no_match(self, drafts_dir):
        d, _ = drafts_dir
        _write_draft(d, "My-Great-Post.md", "My Great Post")
        result = jekyll_tools._find_draft_by_slug(["My-Great-Post.md"], "nonexistent")
        assert result is None

    def test_case_insensitive(self, drafts_dir):
        d, _ = drafts_dir
        _write_draft(d, "My-Great-Post.md", "My Great Post")
        result = jekyll_tools._find_draft_by_slug(["My-Great-Post.md"], "MY-GREAT-POST")
        assert result == "My-Great-Post.md"


@pytest.fixture()
def promote_mocks(monkeypatch):
    calls = {"enrich": 0, "backlinks": 0, "embed": 0}
    monkeypatch.setattr("os.system", lambda cmd: None)
    monkeypatch.setattr(jekyll_tools, "enrich_frontmatter", lambda args: calls.update(enrich=calls["enrich"] + 1))
    import etl.sources.backlinks as _bl
    monkeypatch.setattr(_bl, "generate_backlinks", lambda: calls.update(backlinks=calls["backlinks"] + 1))
    import embed as _emb
    monkeypatch.setattr(_emb, "main", lambda: calls.update(embed=calls["embed"] + 1))
    return calls


class TestPromoteDraftBySlug:
    def test_promotes_by_slug(self, drafts_dir, promote_mocks):
        d, p = drafts_dir
        _write_draft(d, "The-Librarian-I-Want-To-Be.md", "The Librarian I Want To Be", slug="the-librarian")

        jekyll_tools.promote_draft(_make_args(slug="the-librarian"))

        assert not (d / "The-Librarian-I-Want-To-Be.md").exists()
        assert len(list(p.glob("*-The-Librarian-I-Want-To-Be.md"))) == 1

    def test_promotes_by_filename_stem(self, drafts_dir, promote_mocks):
        d, p = drafts_dir
        _write_draft(d, "The-Librarian-I-Want-To-Be.md", "The Librarian I Want To Be")

        jekyll_tools.promote_draft(_make_args(slug="the-librarian-i-want-to-be"))

        assert len(list(p.glob("*-The-Librarian-I-Want-To-Be.md"))) == 1

    def test_runs_enrich_backlinks_and_embed_on_success(self, drafts_dir, promote_mocks):
        d, _ = drafts_dir
        _write_draft(d, "Some-Draft.md", "Some Draft", slug="some-draft")

        jekyll_tools.promote_draft(_make_args(slug="some-draft"))

        assert promote_mocks["enrich"] == 1
        assert promote_mocks["backlinks"] == 1
        assert promote_mocks["embed"] == 1

    def test_prints_available_when_slug_not_found(self, drafts_dir, promote_mocks, capsys):
        d, p = drafts_dir
        _write_draft(d, "Some-Draft.md", "Some Draft")

        jekyll_tools.promote_draft(_make_args(slug="nonexistent"))

        out = capsys.readouterr().out
        assert "No draft found" in out
        assert "some-draft" in out.lower() or "Some-Draft" in out
        assert not list(p.iterdir())
