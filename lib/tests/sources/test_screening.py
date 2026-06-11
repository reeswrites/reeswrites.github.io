"""Tests for profanity-screening helpers in lib/etl/sources/_helpers.py."""

from __future__ import annotations

import pytest

from lib.etl.sources._helpers import screen_tags, screen_text


@pytest.fixture()
def patch_predict(monkeypatch):
    """Return a factory that patches predict_prob with a simple stub.

    The stub returns score 0.9 for any string containing 'BAD', else 0.1.
    """

    def _setup():
        import lib.etl.sources._helpers as helpers

        monkeypatch.setattr(
            helpers,
            "predict_prob",
            lambda texts: [0.9 if "BAD" in t else 0.1 for t in texts],
        )

    _setup()
    return _setup


class TestScreenText:
    def test_clean_text_passes_through(self, patch_predict):
        assert (
            screen_text("A fine book about history.", label="Book")
            == "A fine book about history."
        )

    def test_flagged_text_returns_none(self, patch_predict):
        assert screen_text("BAD content here", label="Flagged") is None

    def test_none_passes_through(self, patch_predict):
        assert screen_text(None) is None

    def test_empty_string_passes_through(self, patch_predict):
        assert screen_text("") == ""

    def test_flagged_text_logs_warning(self, patch_predict, caplog):
        import logging

        with caplog.at_level(logging.WARNING):
            screen_text("BAD content", label="MyBook")
        assert "MyBook" in caplog.text
        assert "Profanity screen" in caplog.text


class TestScreenTags:
    def test_clean_tags_all_kept(self, patch_predict):
        tags = ["Fiction", "Historical", "Drama"]
        assert screen_tags(tags, label="Book") == ["Fiction", "Historical", "Drama"]

    def test_flagged_tag_dropped(self, patch_predict):
        tags = ["Fiction", "BAD tag", "Drama"]
        result = screen_tags(tags, label="Book")
        assert result == ["Fiction", "Drama"]

    def test_all_flagged_returns_empty(self, patch_predict):
        assert screen_tags(["BAD one", "BAD two"], label="Book") == []

    def test_empty_list_passes_through(self, patch_predict):
        assert screen_tags([]) == []

    def test_batch_order_preserved(self, patch_predict):
        tags = ["Alpha", "BAD", "Beta", "Gamma"]
        assert screen_tags(tags) == ["Alpha", "Beta", "Gamma"]

    def test_flagged_tag_logs_warning(self, patch_predict, caplog):
        import logging

        with caplog.at_level(logging.WARNING):
            screen_tags(["BAD subject"], label="MyBook")
        assert "BAD subject" in caplog.text
        assert "MyBook" in caplog.text
