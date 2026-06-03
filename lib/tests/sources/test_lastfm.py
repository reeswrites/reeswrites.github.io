from __future__ import annotations

import csv
import json
import os

import pytest

from lib.etl import config, sources
from lib.tests.sources.conftest import _FakeResponse, write_csv, load_output


def _make_api_response(tracks: list[dict], page: int = 1, total_pages: int = 1) -> dict:
    return {
        "recenttracks": {
            "@attr": {
                "user": "testuser",
                "page": str(page),
                "totalPages": str(total_pages),
                "perPage": "200",
                "total": str(len(tracks)),
            },
            "track": tracks,
        }
    }


def _make_track(
    artist: str, album: str, name: str, uts: int, nowplaying: bool = False
) -> dict:
    track: dict = {
        "artist": {"#text": artist},
        "album": {"#text": album},
        "name": name,
    }
    if nowplaying:
        track["@attr"] = {"nowplaying": "true"}
    else:
        track["date"] = {"uts": str(uts), "#text": "01 Jan 2023, 12:00"}
    return track


class TestTransformLastfm:
    EXCLUDED = [
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
    ]

    def _base_rows(self):
        rows = [
            {
                "artist": "Radiohead",
                "album": "OK Computer",
                "song": "Karma Police",
                "scrobbled_at": "t",
            },
            {
                "artist": "Radiohead",
                "album": "OK Computer",
                "song": "Karma Police",
                "scrobbled_at": "t",
            },
            {
                "artist": "Radiohead",
                "album": "OK Computer",
                "song": "No Surprises",
                "scrobbled_at": "t",
            },
        ]
        for a in self.EXCLUDED:
            rows.append({"artist": a, "album": "A", "song": "S", "scrobbled_at": "t"})
        return rows

    def test_scrobble_counts(self):
        result = sources.transform_lastfm(self._base_rows())
        by_song = {s["song"]: s["scrobbles"] for s in result["scrobbles"]}
        assert by_song["Karma Police"] == 2
        assert by_song["No Surprises"] == 1

    def test_excluded_artists_removed(self):
        result = sources.transform_lastfm(self._base_rows())
        artists = {s["artist"] for s in result["scrobbles"]}
        for exc in self.EXCLUDED:
            assert exc not in artists


class TestGetLatestLastfmData:
    EXCLUDED = [
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
    ]

    def test_scrobble_count_and_grouping(self, dirs):
        inp, out = dirs
        rows = [
            ["Radiohead", "OK Computer", "Karma Police", "t"],
            ["Radiohead", "OK Computer", "Karma Police", "t"],
            ["Radiohead", "OK Computer", "No Surprises", "t"],
        ]
        for a in self.EXCLUDED:
            rows.append([a, "Album", "Song", "t"])
        with open(
            inp / "lastfm-2024-07-08.csv", "w", newline="", encoding="utf-8"
        ) as f:
            writer = csv.writer(f)
            for row in rows:
                writer.writerow(row)
        sources.run_source(sources.SOURCES["lastfm"])
        data = load_output(out, "lastfm")
        by_song = {s["song"]: s["scrobbles"] for s in data["scrobbles"]}
        assert by_song["Karma Police"] == 2
        assert by_song["No Surprises"] == 1
        artists = {s["artist"] for s in data["scrobbles"]}
        for exc in self.EXCLUDED:
            assert exc not in artists


class TestGenerateLastfmInsights:
    EXCLUDED = list(sources.EXCLUDED_LASTFM_ARTISTS)

    @pytest.fixture()
    def site_dirs(self, tmp_path, monkeypatch):
        inp = tmp_path / "input"
        out = tmp_path / "output"
        static_data = tmp_path / "site" / "static" / "data"
        inp.mkdir()
        out.mkdir()
        static_data.mkdir(parents=True)
        monkeypatch.setattr(config, "INPUT_DATA_DIR", str(inp))
        monkeypatch.setattr(config, "OUTPUT_DATA_DIR", str(out))
        monkeypatch.setattr(config, "SITE_ROOT", str(tmp_path / "site"))
        return inp, tmp_path / "site"

    def _write_csv(self, path, rows):
        with open(path, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            for row in rows:
                writer.writerow(row)

    def _load_output(self, site_root):
        p = os.path.join(str(site_root), "static", "data", "scrobbles.json")
        with open(p, encoding="utf-8") as f:
            return json.load(f)

    def test_week_bucketing(self, site_dirs):
        inp, site = site_dirs
        rows = [
            ["Radiohead", "OK Computer", "Karma Police", "02 Jan 2023 12:00"],
            ["Radiohead", "OK Computer", "Karma Police", "04 Jan 2023 08:30"],
            ["Radiohead", "OK Computer", "Karma Police", "10 Jan 2023 22:00"],
            ["Radiohead", "OK Computer", "No Surprises", "03 Jan 2023 10:00"],
        ]
        self._write_csv(inp / "lastfm-2023-01-31.csv", rows)
        sources.generate_lastfm_insights()
        data = self._load_output(site)

        assert "2023-01-02" in data["weeks"]
        assert "2023-01-09" in data["weeks"]
        assert data["weeks"] == sorted(data["weeks"])

        w1_idx = data["weeks"].index("2023-01-02")
        w2_idx = data["weeks"].index("2023-01-09")
        artist_idx = data["artists"].index("Radiohead")
        album_idx = data["albums"].index("OK Computer")
        kp_song = data["songs"].index("Karma Police")
        ns_song = data["songs"].index("No Surprises")

        kp_track = next(
            i for i, t in enumerate(data["tracks"])
            if t == [artist_idx, album_idx, kp_song]
        )
        ns_track = next(
            i for i, t in enumerate(data["tracks"])
            if t == [artist_idx, album_idx, ns_song]
        )

        plays_by_key = {(p[0], p[1]): p[2] for p in data["plays"]}
        assert plays_by_key[(kp_track, w1_idx)] == 2
        assert plays_by_key[(kp_track, w2_idx)] == 1
        assert plays_by_key[(ns_track, w1_idx)] == 1

    def test_excluded_artists_removed(self, site_dirs):
        inp, site = site_dirs
        rows = [["Radiohead", "OK Computer", "Karma Police", "01 Jan 2023 12:00"]]
        for excluded in self.EXCLUDED:
            rows.append([excluded, "Album", "Song", "01 Jan 2023 10:00"])
        self._write_csv(inp / "lastfm-2023-01-31.csv", rows)
        sources.generate_lastfm_insights()
        data = self._load_output(site)

        assert "Radiohead" in data["artists"]
        for exc in self.EXCLUDED:
            assert exc not in data["artists"]

    def test_unparseable_timestamps_skipped(self, site_dirs):
        inp, site = site_dirs
        rows = [
            ["Radiohead", "OK Computer", "Karma Police", "01 Jan 2023 12:00"],
            ["Radiohead", "OK Computer", "No Surprises", "not-a-date"],
        ]
        self._write_csv(inp / "lastfm-2023-01-31.csv", rows)
        sources.generate_lastfm_insights()
        data = self._load_output(site)

        assert "Karma Police" in data["songs"]
        assert "No Surprises" not in data["songs"]

    def test_no_input_file_does_not_raise(self, site_dirs):
        sources.generate_lastfm_insights()  # must not raise

    def test_string_interning_indices_consistent(self, site_dirs):
        inp, site = site_dirs
        rows = [
            ["Artist A", "Album X", "Song 1", "01 Jan 2023 12:00"],
            ["Artist A", "Album X", "Song 2", "02 Jan 2023 08:00"],
            ["Artist B", "Album Y", "Song 1", "03 Jan 2023 09:00"],
        ]
        self._write_csv(inp / "lastfm-2023-01-31.csv", rows)
        sources.generate_lastfm_insights()
        data = self._load_output(site)

        for track in data["tracks"]:
            ai, li, si = track
            assert 0 <= ai < len(data["artists"])
            assert 0 <= li < len(data["albums"])
            assert 0 <= si < len(data["songs"])

        for week in data["weeks"]:
            assert len(week) == 10 and week[4] == "-" and week[7] == "-"

        for play in data["plays"]:
            ti, wi, count = play
            assert 0 <= ti < len(data["tracks"])
            assert 0 <= wi < len(data["weeks"])
            assert count > 0


class TestFetchLastfmScrobbles:
    @pytest.fixture()
    def api_dirs(self, tmp_path, monkeypatch):
        monkeypatch.setattr(config, "INPUT_DATA_DIR", str(tmp_path))
        monkeypatch.setenv("LASTFM_API_KEY", "fake-key")
        monkeypatch.setenv("LASTFM_USER", "testuser")
        return tmp_path

    def test_basic_row_shape(self, api_dirs, monkeypatch):
        payload = _make_api_response(
            [_make_track("Radiohead", "OK Computer", "Karma Police", 1672574400)]
        )
        monkeypatch.setattr("requests.get", lambda *a, **kw: _FakeResponse(payload))

        rows = sources.fetch_lastfm_scrobbles()

        assert len(rows) == 1
        row = rows[0]
        assert row["artist"] == "Radiohead"
        assert row["album"] == "OK Computer"
        assert row["song"] == "Karma Police"
        assert "scrobbled_at" in row
        assert "uts" in row

    def test_timestamp_format(self, api_dirs, monkeypatch):
        from datetime import datetime
        uts = 1672574400
        payload = _make_api_response([_make_track("A", "B", "C", uts)])
        monkeypatch.setattr("requests.get", lambda *a, **kw: _FakeResponse(payload))

        rows = sources.fetch_lastfm_scrobbles()
        datetime.strptime(rows[0]["scrobbled_at"], sources._LASTFM_TS_FORMAT)

    def test_nowplaying_track_skipped(self, api_dirs, monkeypatch):
        payload = _make_api_response(
            [
                _make_track("Radiohead", "OK Computer", "Karma Police", 1672574400, nowplaying=True),
                _make_track("Radiohead", "OK Computer", "No Surprises", 1672578000),
            ]
        )
        monkeypatch.setattr("requests.get", lambda *a, **kw: _FakeResponse(payload))

        rows = sources.fetch_lastfm_scrobbles()

        assert len(rows) == 1
        assert rows[0]["song"] == "No Surprises"

    def test_cache_file_written(self, api_dirs, monkeypatch):
        uts = 1672574400
        payload = _make_api_response([_make_track("A", "B", "C", uts)])
        monkeypatch.setattr("requests.get", lambda *a, **kw: _FakeResponse(payload))

        sources.fetch_lastfm_scrobbles()

        cache_path = api_dirs / sources.LASTFM_CACHE_FILENAME
        assert cache_path.exists()
        cache = json.loads(cache_path.read_text(encoding="utf-8"))
        assert cache["last_uts"] == uts
        assert len(cache["scrobbles"]) == 1

    def test_incremental_uses_from_param(self, api_dirs, monkeypatch):
        uts1 = 1672574400
        uts2 = 1672660800
        calls: list[dict] = []

        def fake_get(url, params=None, **kw):
            calls.append(dict(params or {}))
            if len(calls) == 1:
                return _FakeResponse(_make_api_response([_make_track("A", "B", "C", uts1)]))
            return _FakeResponse(_make_api_response([_make_track("A", "B", "D", uts2)]))

        monkeypatch.setattr("requests.get", fake_get)

        sources.fetch_lastfm_scrobbles()
        sources.fetch_lastfm_scrobbles()

        assert len(calls) == 2
        assert calls[1].get("from") == uts1 + 1

    def test_incremental_deduplicates(self, api_dirs, monkeypatch):
        uts = 1672574400
        payload = _make_api_response([_make_track("A", "B", "C", uts)])
        monkeypatch.setattr("requests.get", lambda *a, **kw: _FakeResponse(payload))

        sources.fetch_lastfm_scrobbles()
        rows = sources.fetch_lastfm_scrobbles()

        assert len(rows) == 1

    def test_missing_env_raises(self, tmp_path, monkeypatch):
        monkeypatch.setattr(config, "INPUT_DATA_DIR", str(tmp_path))
        monkeypatch.delenv("LASTFM_API_KEY", raising=False)
        monkeypatch.delenv("LASTFM_USER", raising=False)

        with pytest.raises(ValueError, match="LASTFM"):
            sources.fetch_lastfm_scrobbles()

    def test_single_track_response_coerced(self, api_dirs, monkeypatch):
        uts = 1672574400
        payload = {
            "recenttracks": {
                "@attr": {"page": "1", "totalPages": "1"},
                "track": _make_track("A", "B", "C", uts),
            }
        }
        monkeypatch.setattr("requests.get", lambda *a, **kw: _FakeResponse(payload))

        rows = sources.fetch_lastfm_scrobbles()
        assert len(rows) == 1

    def test_empty_response_returns_empty(self, api_dirs, monkeypatch):
        payload = _make_api_response([])
        monkeypatch.setattr("requests.get", lambda *a, **kw: _FakeResponse(payload))

        rows = sources.fetch_lastfm_scrobbles()
        assert rows == []
