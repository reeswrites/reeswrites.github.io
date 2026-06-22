from __future__ import annotations

import json
import os

import pytest

from lib.etl import config, sources
from lib.etl.sources.github import EXCLUDED_REPOS, fetch_github_pushes

from .conftest import _FakeResponse


class _FakeGHResponse(_FakeResponse):
    """FakeResponse with a headers dict for Link pagination checking."""

    def __init__(self, payload, link_header: str = ""):
        super().__init__(payload)
        self.headers = {"Link": link_header}


def _push_event(repo: str, push_id: str, date: str = "2026-06-20"):
    return {
        "type": "PushEvent",
        "created_at": f"{date}T12:00:00Z",
        "repo": {"name": repo},
        "payload": {
            "push_id": push_id,
            "head": "abc123",
            "ref": "refs/heads/master",
        },
    }


def _watch_event(repo: str):
    return {"type": "WatchEvent", "repo": {"name": repo}, "payload": {}}


class TestFetchGithubPushes:
    def test_fresh_fetch_writes_cache(self, dirs, monkeypatch):
        inp, out = dirs
        events = [_push_event("reeshuffled/proj-a", "push1")]
        monkeypatch.setattr(
            "requests.get", lambda url, headers: _FakeGHResponse(events)
        )
        pushes = fetch_github_pushes("reeshuffled")
        assert len(pushes) == 1
        assert pushes[0]["push_id"] == "push1"
        assert pushes[0]["repo"] == "reeshuffled/proj-a"
        cache_path = os.path.join(str(inp), "github-cache.json")
        assert os.path.exists(cache_path)

    def test_deduplicates_by_push_id(self, dirs, monkeypatch):
        inp, out = dirs
        cached = {"pushes": [{"push_id": "push1", "repo": "reeshuffled/proj-a", "date": "2026-06-19", "head": "abc", "ref": "refs/heads/master"}]}
        cache_path = os.path.join(str(inp), "github-cache.json")
        with open(cache_path, "w") as f:
            json.dump(cached, f)

        events = [_push_event("reeshuffled/proj-a", "push1")]
        monkeypatch.setattr(
            "requests.get", lambda url, headers: _FakeGHResponse(events)
        )
        pushes = fetch_github_pushes("reeshuffled")
        assert len(pushes) == 1

    def test_new_push_appended_to_cache(self, dirs, monkeypatch):
        inp, out = dirs
        cached = {"pushes": [{"push_id": "push1", "repo": "reeshuffled/proj-a", "date": "2026-06-19", "head": "abc", "ref": "refs/heads/master"}]}
        cache_path = os.path.join(str(inp), "github-cache.json")
        with open(cache_path, "w") as f:
            json.dump(cached, f)

        events = [_push_event("reeshuffled/proj-a", "push2")]
        monkeypatch.setattr(
            "requests.get", lambda url, headers: _FakeGHResponse(events)
        )
        pushes = fetch_github_pushes("reeshuffled")
        assert len(pushes) == 2
        ids = {p["push_id"] for p in pushes}
        assert ids == {"push1", "push2"}

    def test_excluded_repos_filtered(self, dirs, monkeypatch):
        inp, out = dirs
        excluded = next(iter(EXCLUDED_REPOS))
        events = [
            _push_event(excluded, "push-excluded"),
            _push_event("reeshuffled/other", "push-kept"),
        ]
        monkeypatch.setattr(
            "requests.get", lambda url, headers: _FakeGHResponse(events)
        )
        pushes = fetch_github_pushes("reeshuffled")
        assert all(p["repo"] != excluded for p in pushes)
        assert any(p["push_id"] == "push-kept" for p in pushes)

    def test_non_push_events_ignored(self, dirs, monkeypatch):
        inp, out = dirs
        events = [_watch_event("reeshuffled/proj-a")]
        monkeypatch.setattr(
            "requests.get", lambda url, headers: _FakeGHResponse(events)
        )
        pushes = fetch_github_pushes("reeshuffled")
        assert pushes == []

    def test_empty_response_stops_pagination(self, dirs, monkeypatch):
        inp, out = dirs
        call_count = 0

        def fake_get(url, headers):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return _FakeGHResponse(
                    [_push_event("reeshuffled/proj-a", "push1")],
                    link_header='<url>; rel="next"',
                )
            return _FakeGHResponse([])

        monkeypatch.setattr("requests.get", fake_get)
        pushes = fetch_github_pushes("reeshuffled")
        assert call_count == 2
        assert len(pushes) == 1


class TestGetGithubActivity:
    def test_writes_aggregated_github_activity_json(self, dirs, monkeypatch):
        inp, out = dirs
        events = [
            _push_event("reeshuffled/proj-a", "push1", date="2026-06-20"),
            _push_event("reeshuffled/proj-a", "push2", date="2026-06-20"),
            _push_event("reeshuffled/proj-b", "push3", date="2026-06-19"),
        ]
        monkeypatch.setattr(
            "requests.get", lambda url, headers: _FakeGHResponse(events)
        )
        sources.get_github_activity()
        out_path = os.path.join(str(out), "github_activity.json")
        assert os.path.exists(out_path)
        with open(out_path) as f:
            data = json.load(f)
        assert "activity" in data
        assert "last_updated" in data
        proj_a = next(r for r in data["activity"] if r["repo"] == "reeshuffled/proj-a")
        assert proj_a["count"] == 2
        assert proj_a["date"] == "2026-06-20"
        proj_b = next(r for r in data["activity"] if r["repo"] == "reeshuffled/proj-b")
        assert proj_b["count"] == 1


class TestActivityFeedGithubIntegration:
    @pytest.fixture()
    def site_dirs(self, tmp_path, monkeypatch):
        site = tmp_path / "site"
        inp = tmp_path / "input"
        out = tmp_path / "output"
        (site / "_data").mkdir(parents=True)
        (site / "static" / "data").mkdir(parents=True)
        inp.mkdir()
        out.mkdir()
        monkeypatch.setattr(config, "INPUT_DATA_DIR", str(inp))
        monkeypatch.setattr(config, "OUTPUT_DATA_DIR", str(out))
        monkeypatch.setattr(config, "SITE_ROOT", str(site))
        return site, out

    def test_github_entries_appear_in_feed(self, site_dirs):
        site, out = site_dirs
        gh_data = {
            "activity": [
                {"date": "2026-06-20", "repo": "reeshuffled/proj-a", "count": 2},
                {"date": "2026-06-19", "repo": "reeshuffled/proj-b", "count": 1},
            ],
            "last_updated": "2026-06-22",
        }
        with open(os.path.join(str(out), "github_activity.json"), "w") as f:
            json.dump(gh_data, f)

        sources.generate_activity_feed()
        feed_path = site / "static" / "data" / "activity.json"
        with open(feed_path) as f:
            feed = json.load(f)

        gh_entries = [e for e in feed["entries"] if e["type"] == "github"]
        assert len(gh_entries) == 2

        proj_a = next(e for e in gh_entries if e["label"] == "proj-a")
        assert proj_a["date"] == "2026-06-20"
        assert proj_a["detail"] == "Committed 2 times"
        assert proj_a["repo"] == "reeshuffled/proj-a"

        proj_b = next(e for e in gh_entries if e["label"] == "proj-b")
        assert proj_b["detail"] == "Committed 1 time"

    def test_no_github_file_no_error(self, site_dirs):
        site, out = site_dirs
        sources.generate_activity_feed()
        feed_path = site / "static" / "data" / "activity.json"
        with open(feed_path) as f:
            feed = json.load(f)
        assert all(e["type"] != "github" for e in feed["entries"])
