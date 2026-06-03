from __future__ import annotations

import json

import pytest

from lib.etl import config, sources


class TestIsPublishCommit:
    def test_plain_publish_message(self):
        assert sources._is_publish_commit("publish how to try more beer") is True

    def test_publish_colon_variant(self):
        assert sources._is_publish_commit("publish: n0rth4ever ep review") is True

    def test_capitalised_publish(self):
        assert sources._is_publish_commit("Publish My Post") is True

    def test_non_publish_message(self):
        assert sources._is_publish_commit("update posts") is False

    def test_empty_string(self):
        assert sources._is_publish_commit("") is False

    def test_leading_whitespace(self):
        assert sources._is_publish_commit("  publish a post") is True


class TestGenerateActivityFeedPublishDedup:
    """Verify that publish-only changelog lines are stripped from the activity feed."""

    @pytest.fixture()
    def site_dirs(self, tmp_path, monkeypatch):
        site = tmp_path / "site"
        inp = tmp_path / "input"
        out = tmp_path / "output"
        data_dir = site / "_data"
        static_data = site / "static" / "data"
        inp.mkdir()
        out.mkdir()
        data_dir.mkdir(parents=True)
        static_data.mkdir(parents=True)
        monkeypatch.setattr(config, "INPUT_DATA_DIR", str(inp))
        monkeypatch.setattr(config, "OUTPUT_DATA_DIR", str(out))
        monkeypatch.setattr(config, "SITE_ROOT", str(site))
        return site

    def _load_activity(self, site):
        p = site / "static" / "data" / "activity.json"
        with open(p, encoding="utf-8") as f:
            return json.load(f)

    def _write_changelog(self, site, entries):
        path = site / "_data" / "changelog.json"
        with open(path, "w", encoding="utf-8") as f:
            json.dump({"entries": entries}, f)

    def test_publish_line_stripped_from_mixed_day(self, site_dirs):
        """A day with both a publish commit and a normal commit keeps only the normal one."""
        self._write_changelog(site_dirs, [
            {
                "date": "2026-05-25",
                "entries": [
                    "publish evolving as a beer drinker article",
                    "update deps",
                ],
            }
        ])
        sources.generate_activity_feed()
        data = self._load_activity(site_dirs)
        changelog_entries = [e for e in data["entries"] if e["type"] == "changelog"]
        assert len(changelog_entries) == 1
        day = changelog_entries[0]
        assert day["date"] == "2026-05-25"
        assert "update deps" in day["entries"]
        assert not any(m.lower().startswith("publish") for m in day["entries"])

    def test_publish_only_day_produces_no_changelog_entry(self, site_dirs):
        """A day whose only commits are publish commits emits no changelog entry at all."""
        self._write_changelog(site_dirs, [
            {
                "date": "2026-05-26",
                "entries": [
                    "publish my article",
                    "publish: another article",
                ],
            }
        ])
        sources.generate_activity_feed()
        data = self._load_activity(site_dirs)
        changelog_entries = [e for e in data["entries"] if e["type"] == "changelog"]
        assert changelog_entries == []

    def test_non_publish_day_unchanged(self, site_dirs):
        """A day with no publish commits passes through verbatim."""
        self._write_changelog(site_dirs, [
            {
                "date": "2026-05-27",
                "entries": ["clean up some code", "update deps"],
            }
        ])
        sources.generate_activity_feed()
        data = self._load_activity(site_dirs)
        changelog_entries = [e for e in data["entries"] if e["type"] == "changelog"]
        assert len(changelog_entries) == 1
        assert changelog_entries[0]["entries"] == ["clean up some code", "update deps"]
