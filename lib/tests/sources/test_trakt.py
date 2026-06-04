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


# ---------------------------------------------------------------------------
# enrich_trakt_with_tmdb
# ---------------------------------------------------------------------------


def _make_tmdb_tv_response(tmdb_id: int = 100) -> dict:
    """Fake TMDB /tv/{id} response."""
    return {
        "id": tmdb_id,
        "genres": [{"id": 1, "name": "Animation"}, {"id": 2, "name": "Action & Adventure"}],
        "origin_country": ["JP"],
        "episode_run_time": [24],
        "vote_average": 7.8,
        "seasons": [
            {"season_number": 0, "episode_count": 3},   # specials — season 0
            {"season_number": 1, "episode_count": 12},
            {"season_number": 2, "episode_count": 24},
        ],
    }


def _make_show_with_tmdb(title: str = "Test Show", tmdb_id: int = 100) -> dict:
    return {
        "title": title,
        "year": 2021,
        "tmdb_id": tmdb_id,
        "seasons": [
            {"season": 1, "watched": [{"number": 1, "watched_date": "2024-01-01T00:00:00.000Z"},
                                       {"number": 2, "watched_date": "2024-01-02T00:00:00.000Z"},
                                       {"number": 3, "watched_date": "2024-01-03T00:00:00.000Z"}],
             "episodes": 3},
            {"season": 2, "watched": [{"number": 1, "watched_date": "2024-06-01T00:00:00.000Z"}],
             "episodes": 1},
        ],
    }


class TestEnrichTraktWithTmdb:
    @pytest.fixture()
    def cache_dir(self, tmp_path, monkeypatch):
        monkeypatch.setattr(config, "INPUT_DATA_DIR", str(tmp_path))
        return tmp_path

    def _patch_tmdb(self, monkeypatch, response_fn=None):
        """Patch _tmdb_get in the trakt module to return a fake payload."""
        calls: list[str] = []

        def fake_tmdb_get(path: str, api_key: str, params=None):
            calls.append(path)
            tmdb_id = int(path.split("/")[-1])
            return (response_fn or _make_tmdb_tv_response)(tmdb_id)

        monkeypatch.setattr("lib.etl.sources.trakt._tmdb_get", fake_tmdb_get)
        return calls

    def test_merges_genres_and_total_episodes(self, cache_dir, monkeypatch):
        self._patch_tmdb(monkeypatch)
        shows = [_make_show_with_tmdb()]
        result = sources.enrich_trakt_with_tmdb(shows, api_key="fake-key")

        assert len(result) == 1
        show = result[0]
        assert show["genres"] == ["Animation", "Action & Adventure"]
        assert show["origin_country"] == ["JP"]
        assert show["episode_run_time"] == 24
        season1 = next(s for s in show["seasons"] if s["season"] == 1)
        assert season1["total_episodes"] == 12
        assert season1["episodes"] == 3  # watched count unchanged
        season2 = next(s for s in show["seasons"] if s["season"] == 2)
        assert season2["total_episodes"] == 24

    def test_cache_written_after_fetch(self, cache_dir, monkeypatch):
        self._patch_tmdb(monkeypatch)
        shows = [_make_show_with_tmdb(tmdb_id=999)]
        sources.enrich_trakt_with_tmdb(shows, api_key="fake-key")

        cache_path = cache_dir / sources.TMDB_TV_CACHE_FILENAME
        assert cache_path.exists()
        cache = json.loads(cache_path.read_text(encoding="utf-8"))
        assert "999" in cache
        assert cache["999"]["genres"] == ["Animation", "Action & Adventure"]
        assert cache["999"]["origin_country"] == ["JP"]
        assert cache["999"]["episode_run_time"] == 24

    def test_cached_ids_not_refetched(self, cache_dir, monkeypatch):
        calls = self._patch_tmdb(monkeypatch)
        # Pre-populate cache for tmdb_id=100
        cache_path = cache_dir / sources.TMDB_TV_CACHE_FILENAME
        existing = {"100": {"genres": ["Drama"], "season_episode_counts": {"1": 10}, "tmdb_score": 8.0}}
        cache_path.write_text(json.dumps(existing), encoding="utf-8")

        shows = [_make_show_with_tmdb(tmdb_id=100)]
        result = sources.enrich_trakt_with_tmdb(shows, api_key="fake-key")

        assert calls == []  # no new TMDB calls
        assert result[0]["genres"] == ["Drama"]

    def test_show_without_tmdb_id_passes_through(self, cache_dir, monkeypatch):
        calls = self._patch_tmdb(monkeypatch)
        show = {"title": "No TMDB Show", "year": 2020,
                "seasons": [{"season": 1, "watched": [], "episodes": 0}]}
        result = sources.enrich_trakt_with_tmdb([show], api_key="fake-key")

        assert calls == []
        assert result[0] == show

    def test_tmdb_error_caches_none_and_continues(self, cache_dir, monkeypatch):
        def exploding_tmdb_get(path, api_key, params=None):
            raise RuntimeError("network error")

        monkeypatch.setattr("lib.etl.sources.trakt._tmdb_get", exploding_tmdb_get)
        shows = [_make_show_with_tmdb(tmdb_id=42)]
        result = sources.enrich_trakt_with_tmdb(shows, api_key="fake-key")

        # show passes through unchanged
        assert "genres" not in result[0]
        cache_path = cache_dir / sources.TMDB_TV_CACHE_FILENAME
        cache = json.loads(cache_path.read_text(encoding="utf-8"))
        assert cache["42"] is None

    def test_transform_export_captures_tmdb_id(self):
        raw = [
            {
                "show": {
                    "title": "Example Show",
                    "year": 2022,
                    "ids": {"tmdb": 12345, "imdb": "tt999", "trakt": 1},
                    "aired_episodes": 10,
                },
                "seasons": [
                    {"number": 1, "episodes": [{"number": 1, "last_watched_at": "2024-01-01T00:00:00.000Z"}]},
                ],
            }
        ]
        result = sources.transform_trakt_export(raw)
        assert result[0]["tmdb_id"] == 12345

    def test_transform_export_no_tmdb_id_when_missing(self):
        raw = [
            {
                "show": {"title": "No TMDB", "year": 2020, "ids": {}, "aired_episodes": 5},
                "seasons": [
                    {"number": 1, "episodes": [{"number": 1, "last_watched_at": "2024-01-01T00:00:00.000Z"}]},
                ],
            }
        ]
        result = sources.transform_trakt_export(raw)
        assert "tmdb_id" not in result[0]
