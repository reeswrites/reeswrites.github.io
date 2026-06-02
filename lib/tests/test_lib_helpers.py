"""Unit tests for pure helper functions in lib/embed.py and lib/stats.py."""
from __future__ import annotations

import sys
import types

# embed imports heavy optional deps at module level; stub them before import
_st = types.ModuleType("sentence_transformers")
_st.SentenceTransformer = object  # type: ignore[attr-defined]
sys.modules["sentence_transformers"] = _st

_umap = types.ModuleType("umap")
_umap.UMAP = object  # type: ignore[attr-defined]
sys.modules["umap"] = _umap

from lib import embed, stats


# ---------------------------------------------------------------------------
# embed.normalise_tags
# ---------------------------------------------------------------------------

class TestNormaliseTags:
    def test_none(self):
        assert embed.normalise_tags(None) == []

    def test_empty_list(self):
        assert embed.normalise_tags([]) == []

    def test_list(self):
        assert embed.normalise_tags(["a", "b"]) == ["a", "b"]

    def test_single_string(self):
        assert embed.normalise_tags("solo") == ["solo"]

    def test_coerces_non_str(self):
        assert embed.normalise_tags([1, 2]) == ["1", "2"]


# ---------------------------------------------------------------------------
# embed.slug_from_url
# ---------------------------------------------------------------------------

class TestSlugFromUrl:
    def test_basic(self):
        assert embed.slug_from_url("/posts/my-post/") == "my-post"

    def test_no_trailing_slash(self):
        assert embed.slug_from_url("/posts/my-post") == "my-post"

    def test_root(self):
        assert embed.slug_from_url("/posts/") == "posts"


# ---------------------------------------------------------------------------
# embed.hash_content
# ---------------------------------------------------------------------------

class TestHashContent:
    def test_length(self):
        assert len(embed.hash_content("hello")) == 16

    def test_deterministic(self):
        assert embed.hash_content("x") == embed.hash_content("x")

    def test_different_inputs(self):
        assert embed.hash_content("a") != embed.hash_content("b")


# ---------------------------------------------------------------------------
# stats.count_words_in_markdown
# ---------------------------------------------------------------------------

class TestCountWordsInMarkdown:
    def test_plain(self):
        assert stats.count_words_in_markdown("hello world") == 2

    def test_strips_html_tags(self):
        assert stats.count_words_in_markdown("<p>hello world</p>") == 2

    def test_strips_images(self):
        assert stats.count_words_in_markdown("![alt](img.png) word") == 1

    def test_strips_html_comments(self):
        assert stats.count_words_in_markdown("<!-- ignored --> word") == 1

    def test_indented_code_block_not_counted(self):
        assert stats.count_words_in_markdown("    codeblock\nword") == 1
