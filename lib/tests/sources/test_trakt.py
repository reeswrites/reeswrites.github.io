from __future__ import annotations

import json

import pytest

from lib.etl import config, sources
from lib.tests.sources.conftest import _FakeResponse, _FakeXMLResponse


def _make_trakt_last_activities(watched_at: str) -> dict:
    return {"episodes": {"watched_at": watched_at}, "movies": {}}


def _make_trakt_shows(n: int = 1) -> list[dict]:
    return [
        {
            "show": {"title": f"Show {i}", "year": 2020 + i, "ids": {}, "aired_episodes": 10},
            "seasons": [
                {
                    "number": 1,
                    "episodes": [
                        {"number": 1, "last_watched_at": "2024-01-01T00:00:00.000Z"}
                    ],
                }
            ],
        }
        for i in range(n)
    ]


class TestTransformTraktExport:
    def _entry(self, title="Test Show", year=2024, seasons=None):
        return {
            "show": {"title": title, "year": year, "ids": {}, "aired_episodes": 12},
            "seasons": seasons
            or [
                {
                    "number": 1,
                    "episodes": [
                        {
                            "number": 1,
                            "plays": 1,
                            "last_watched_at": "2024-01-01T20:00:00.000Z",
                        },
                        {
                            "number": 2,
                            "plays": 1,
                            "last_watched_at": "2024-01-08T20:00:00.000Z",
                        },
                    ],
                }
            ],
        }

    def test_basic_shape(self):
        result = sources.transform_trakt_export([self._entry()])
        assert len(result) == 1
        show = result[0]
        assert show["title"] == "Test Show"
        assert show["year"] == 2024
        assert len(show["seasons"]) == 1

    def test_season_fields(self):
        result = sources.transform_trakt_export([self._entry()])
        season = result[0]["seasons"][0]
        assert season["season"] == 1
        assert season["episodes"] == 2
        assert len(season["watched"]) == 2

    def test_watched_episode_shape(self):
        result = sources.transform_trakt_export([self._entry()])
        ep = result[0]["seasons"][0]["watched"][0]
        assert ep["number"] == 1
        assert ep["watched_date"] == "2024-01-01T20:00:00.000Z"

    def test_multiple_shows(self):
        result = sources.transform_trakt_export(
            [self._entry("Show A"), self._entry("Show B")]
        )
        assert [s["title"] for s in result] == ["Show A", "Show B"]

    def test_multiple_seasons(self):
        entry = self._entry(
            seasons=[
                {
                    "number": 1,
                    "episodes": [
                        {
                            "number": 1,
                            "plays": 1,
                            "last_watched_at": "2024-01-01T00:00:00.000Z",
                        }
                    ],
                },
                {
                    "number": 2,
                    "episodes": [
                        {
                            "number": 1,
                            "plays": 1,
                            "last_watched_at": "2024-06-01T00:00:00.000Z",
                        },
                        {
                            "number": 2,
                            "plays": 1,
                            "last_watched_at": "2024-06-08T00:00:00.000Z",
                        },
                    ],
                },
            ]
        )
        result = sources.transform_trakt_export([entry])
        seasons = result[0]["seasons"]
        assert seasons[0]["season"] == 1 and seasons[0]["episodes"] == 1
        assert seasons[1]["season"] == 2 and seasons[1]["episodes"] == 2

    def test_empty_input(self):
        assert sources.transform_trakt_export([]) == []


class TestTransformTraktExportWatchedDate:
    """Verify the episode key is 'watched_date', not 'date'."""

    def test_episode_key_is_watched_date(self):
        raw = _make_trakt_shows(1)
        result = sources.transform_trakt_export(raw)
        episode = result[0]["seasons"][0]["watched"][0]
        assert "watched_date" in episode, "episode must have 'watched_date' key"
        assert "date" not in episode, "old 'date' key must not be present"
        assert episode["watched_date"] == "2024-01-01T00:00:00.000Z"


class TestFetchTraktWatchedShows:
    @pytest.fixture()
    def api_dirs(self, tmp_path, monkeypatch):
        monkeypatch.setattr(config, "INPUT_DATA_DIR", str(tmp_path))
        monkeypatch.setenv("TRAKT_CLIENT_ID", "fake-client-id")
        monkeypatch.setenv("TRAKT_ACCESS_TOKEN", "fake-token")
        return tmp_path

    def test_skips_refetch_when_nothing_new(self, api_dirs, monkeypatch):
        """When cached watched_at matches last_activities, no shows fetch is made."""
        watched_at = "2024-01-01T00:00:00.000Z"
        shows = _make_trakt_shows(2)
        cache = {"watched_at": watched_at, "shows": shows}
        (api_dirs / sources.TRAKT_CACHE_FILENAME).write_text(
            json.dumps(cache), encoding="utf-8"
        )

        calls: list[str] = []

        def fake_get(url, **kwargs):
            calls.append(url)
            return _FakeResponse(_make_trakt_last_activities(watched_at))

        monkeypatch.setattr("requests.get", fake_get)
        result = sources.fetch_trakt_watched_shows()

        assert len(calls) == 1
        assert "last_activities" in calls[0]
        assert result == shows

    def test_refetches_when_new_watched(self, api_dirs, monkeypatch):
        """When watched_at is newer than cached, the shows endpoint is called."""
        old_at = "2024-01-01T00:00:00.000Z"
        new_at = "2024-06-01T00:00:00.000Z"
        shows = _make_trakt_shows(1)
        cache = {"watched_at": old_at, "shows": []}
        (api_dirs / sources.TRAKT_CACHE_FILENAME).write_text(
            json.dumps(cache), encoding="utf-8"
        )

        calls: list[str] = []

        def fake_get(url, **kwargs):
            calls.append(url)
            if "last_activities" in url:
                return _FakeResponse(_make_trakt_last_activities(new_at))
            return _FakeResponse(shows)

        monkeypatch.setattr("requests.get", fake_get)
        result = sources.fetch_trakt_watched_shows()

        assert len(calls) == 2
        assert result == shows

    def test_cache_written_after_fetch(self, api_dirs, monkeypatch):
        """Cache file is written with updated watched_at and shows after a full fetch."""
        watched_at = "2024-06-01T00:00:00.000Z"
        shows = _make_trakt_shows(3)

        def fake_get(url, **kwargs):
            if "last_activities" in url:
                return _FakeResponse(_make_trakt_last_activities(watched_at))
            return _FakeResponse(shows)

        monkeypatch.setattr("requests.get", fake_get)
        sources.fetch_trakt_watched_shows()

        cache_path = api_dirs / sources.TRAKT_CACHE_FILENAME
        assert cache_path.exists()
        cache = json.loads(cache_path.read_text(encoding="utf-8"))
        assert cache["watched_at"] == watched_at
        assert len(cache["shows"]) == 3

    def test_missing_env_raises(self, tmp_path, monkeypatch):
        monkeypatch.setattr(config, "INPUT_DATA_DIR", str(tmp_path))
        monkeypatch.delenv("TRAKT_CLIENT_ID", raising=False)
        monkeypatch.delenv("TRAKT_ACCESS_TOKEN", raising=False)

        with pytest.raises(ValueError, match="TRAKT"):
            sources.fetch_trakt_watched_shows()
