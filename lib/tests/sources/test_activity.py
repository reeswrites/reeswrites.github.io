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
        self._write_changelog(
            site_dirs,
            [
                {
                    "date": "2026-05-25",
                    "entries": [
                        "publish evolving as a beer drinker article",
                        "update deps",
                    ],
                }
            ],
        )
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
        self._write_changelog(
            site_dirs,
            [
                {
                    "date": "2026-05-26",
                    "entries": [
                        "publish my article",
                        "publish: another article",
                    ],
                }
            ],
        )
        sources.generate_activity_feed()
        data = self._load_activity(site_dirs)
        changelog_entries = [e for e in data["entries"] if e["type"] == "changelog"]
        assert changelog_entries == []

    def test_non_publish_day_unchanged(self, site_dirs):
        """A day with no publish commits passes through verbatim."""
        self._write_changelog(
            site_dirs,
            [
                {
                    "date": "2026-05-27",
                    "entries": ["clean up some code", "update deps"],
                }
            ],
        )
        sources.generate_activity_feed()
        data = self._load_activity(site_dirs)
        changelog_entries = [e for e in data["entries"] if e["type"] == "changelog"]
        assert len(changelog_entries) == 1
        assert changelog_entries[0]["entries"] == ["clean up some code", "update deps"]


class TestRecentActivityFile:
    """The home page shows the 10 newest non-changelog entries; it should not
    have to download the whole feed (7,000+ entries) to get them."""

    @pytest.fixture()
    def site(self, tmp_path, monkeypatch):
        site = tmp_path / "site"
        out = tmp_path / "output"
        (site / "_data").mkdir(parents=True)
        (site / "static" / "data").mkdir(parents=True)
        (tmp_path / "input").mkdir()
        out.mkdir()
        monkeypatch.setattr(config, "INPUT_DATA_DIR", str(tmp_path / "input"))
        monkeypatch.setattr(config, "OUTPUT_DATA_DIR", str(out))
        monkeypatch.setattr(config, "SITE_ROOT", str(site))
        days = [
            {"date": f"2026-01-{d:02d}", "repo": "me/r", "count": 1}
            for d in range(1, 13)
        ]
        (out / "github_activity.json").write_text(json.dumps({"activity": days}))
        (site / "_data" / "changelog.json").write_text(
            json.dumps({"entries": [{"date": "2026-02-01", "entries": ["fix menu"]}]})
        )
        return site

    def test_recent_file_holds_the_ten_newest_non_changelog_entries(self, site):
        sources.generate_activity_feed()
        static = site / "static" / "data"
        full = json.loads((static / "activity.json").read_text())
        recent = json.loads((static / "activity-recent.json").read_text())
        expected = [e for e in full["entries"] if e["type"] != "changelog"][:10]
        assert recent["entries"] == expected
        assert [e["date"] for e in recent["entries"]][0] == "2026-01-12"
        assert recent["last_updated"] == full["last_updated"]
