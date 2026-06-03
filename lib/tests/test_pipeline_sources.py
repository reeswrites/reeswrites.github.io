"""Tests for the source ETL in etl.sources.

Two levels:
  1. Pure transform tests — call sources.transform_*(rows) directly with in-memory data.
     No filesystem, no monkeypatching needed.
  2. IO integration tests — monkeypatch config.INPUT_DATA_DIR/OUTPUT_DATA_DIR,
     write a sample file, call sources.run_source(sources.SOURCES[key]), assert the JSON.
"""

from __future__ import annotations

import csv
import json
import os

import pytest

from lib.etl import config, sources

# ---------------------------------------------------------------------------
# Fixture: redirect I/O dirs to tmp
# ---------------------------------------------------------------------------


@pytest.fixture()
def dirs(tmp_path, monkeypatch):
    inp = tmp_path / "input"
    out = tmp_path / "output"
    inp.mkdir()
    out.mkdir()
    monkeypatch.setattr(config, "INPUT_DATA_DIR", str(inp))
    monkeypatch.setattr(config, "OUTPUT_DATA_DIR", str(out))
    return inp, out


def write_csv(path, rows: list[dict]):
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def load_output(out_dir, name: str) -> dict:
    with open(os.path.join(str(out_dir), f"{name}.json"), encoding="utf-8") as f:
        return json.load(f)


# ============================================================================
# Pure transform tests (no IO — fast, no tmp_path needed)
# ============================================================================


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


class TestTransformRecords:
    def _rows(self, **overrides):
        base = {
            "Album Name": "OK Computer",
            "Artist Name": "Radiohead",
            "Year Released": "1997",
            "Date Purchased": "7/18/2023",
            "Date Received": "7/24/2023",
            "Lead Time": "6",
            "Record Cost": "$19.99",
            "Shipping Cost": "$0.00",
            "Tax": "$1.20",
            "Total Cost": "$21.19",
            "Retailer Name": "Amazon",
            "Online/Physical": "Online",
            "Location": "N/A",
        }
        base.update(overrides)
        return [base]

    def test_date_reformatted(self):
        result = sources.transform_records(self._rows())
        assert result["owned"][0]["date"] == "2023-07-18"

    def test_field_renamed(self):
        result = sources.transform_records(self._rows())
        r = result["owned"][0]
        assert r["album_name"] == "OK Computer"
        assert r["artist_name"] == "Radiohead"
        assert r["release_date"] == "1997"

    def test_dropped_fields_absent(self):
        result = sources.transform_records(self._rows())
        r = result["owned"][0]
        for dropped in ("Date Received", "Lead Time", "Record Cost", "Retailer Name"):
            assert dropped not in r

    def test_output_wrapped(self):
        assert "owned" in sources.transform_records(self._rows())


class TestTransformGames:
    def test_snake_case_and_empty_col_removed(self):
        rows = [
            {"Name": "Wingspan", "Type": "Card", "Mechanism": "Engine Building", "": ""}
        ]
        result = sources.transform_games(rows)
        game = result["games"][0]
        assert game["name"] == "Wingspan"
        assert game["type"] == "Card"
        assert "" not in game

    def test_output_wrapped(self):
        rows = [{"Title": "Dune"}]
        assert "games" in sources.transform_games(rows)


class TestTransformSwimming:
    def test_event_decoded_yard_short(self):
        rows = [
            {
                "EVENT": "100 FR SCY",
                "SWIM TIME": "58.12",
                "AGE": "20",
                "MEET": "Spring",
                "SWIM DATE": "2023-05-01",
                "LSC": "MA",
                "TEAM": "T1",
                "POINTS": "0",
                "TIME STANDARD": "A",
            }
        ]
        result = sources.transform_swimming(rows)
        event = result["times"][0]["event"]
        assert event == {
            "distance": 100,
            "stroke": "Freestyle",
            "unit": "Yard",
            "course": "Short",
        }

    def test_event_decoded_meter_long(self):
        rows = [
            {
                "EVENT": "200 BR LCM",
                "SWIM TIME": "2:45.00",
                "AGE": "21",
                "MEET": "LC Open",
                "SWIM DATE": "2023-07-01",
                "LSC": "MA",
                "TEAM": "T1",
                "POINTS": "0",
                "TIME STANDARD": "B",
            }
        ]
        result = sources.transform_swimming(rows)
        event = result["times"][0]["event"]
        assert event["unit"] == "Meter"
        assert event["course"] == "Long"
        assert event["stroke"] == "Breastroke"


class TestTransformGoodreads:
    def _make_row(self, **overrides):
        base = {
            "Book Id": "1",
            "Title": "Test Book",
            "Author": "Author Name",
            "Author l-f": "Name, Author",
            "Additional Authors": "",
            "ISBN": '=""',
            "ISBN13": '=""',
            "My Rating": "4",
            "Average Rating": "3.9",
            "Publisher": "Pub",
            "Binding": "Paperback",
            "Number of Pages": "300",
            "Year Published": "2020",
            "Original Publication Year": "2020",
            "Date Added": "2023/01/01",
            "Bookshelves": "",
            "Bookshelves with positions": "",
            "Exclusive Shelf": "read",
            "My Review": "",
            "Spoiler": "",
            "Private Notes": "",
            "Read Count": "1",
            "Owned Copies": "0",
            "Date Read": "2023/06/15",
        }
        base.update(overrides)
        return base

    def test_to_read_dropped(self):
        rows = [
            self._make_row(**{"Exclusive Shelf": "read"}),
            self._make_row(
                Title="Want", **{"Exclusive Shelf": "to_read", "Date Read": ""}
            ),
        ]
        result = sources.transform_goodreads(rows)
        assert "to_read" not in result

    def test_read_grouped(self):
        rows = [
            self._make_row(Title="Book A"),
            self._make_row(Title="Book B"),
            self._make_row(
                Title="WTR", **{"Exclusive Shelf": "to_read", "Date Read": ""}
            ),
        ]
        result = sources.transform_goodreads(rows)
        assert len(result["read"]) == 2

    def test_owned_populated(self):
        rows = [
            self._make_row(Title="Mine", Bookshelves="own"),
            self._make_row(Title="Not Mine"),
            self._make_row(
                Title="WTR", **{"Exclusive Shelf": "to_read", "Date Read": ""}
            ),
        ]
        result = sources.transform_goodreads(rows)
        assert len(result["owned"]) == 1
        assert result["owned"][0]["title"] == "Mine"

    def test_date_field_renamed(self):
        rows = [
            self._make_row(**{"Date Read": "2023/06/15"}),
            self._make_row(
                Title="WTR", **{"Exclusive Shelf": "to_read", "Date Read": ""}
            ),
        ]
        result = sources.transform_goodreads(rows)
        assert result["read"][0]["date"] == "2023/06/15"


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


# ============================================================================
# IO integration tests (monkeypatched dirs, run_source)
# ============================================================================


class TestGetLatestRecordsData:
    def test_date_normalization_and_shape(self, dirs):
        inp, out = dirs
        rows = [
            {
                "Album Name": "OK Computer",
                "Artist Name": "Radiohead",
                "Year Released": "1997",
                "Date Purchased": "7/18/2023",
                "Date Received": "7/24/2023",
                "Lead Time": "6",
                "Record Cost": "$19.99",
                "Shipping Cost": "$0.00",
                "Tax": "$1.20",
                "Total Cost": "$21.19",
                "Retailer Name": "Amazon",
                "Online/Physical": "Online",
                "Location": "N/A",
            }
        ]
        write_csv(inp / "records-2024-08-31.csv", rows)
        sources.run_source(sources.SOURCES["records"])
        data = load_output(out, "records")
        assert data["owned"][0]["date"] == "2023-07-18"
        assert data["last_updated"]

    def test_latest_file_wins(self, dirs):
        inp, out = dirs
        base = {
            "Album Name": "",
            "Artist Name": "",
            "Year Released": "",
            "Date Purchased": "1/1/2020",
            "Date Received": "",
            "Lead Time": "",
            "Record Cost": "",
            "Shipping Cost": "",
            "Tax": "",
            "Total Cost": "",
            "Retailer Name": "",
            "Online/Physical": "",
            "Location": "",
        }
        write_csv(inp / "records-2023-01-01.csv", [{**base, "Album Name": "Old"}])
        write_csv(
            inp / "records-2024-08-31.csv",
            [{**base, "Album Name": "New", "Date Purchased": "6/15/2023"}],
        )
        sources.run_source(sources.SOURCES["records"])
        assert load_output(out, "records")["owned"][0]["album_name"] == "New"


class TestGetLatestGameData:
    def test_snake_case_headers_and_empty_col_removed(self, dirs):
        inp, out = dirs
        with open(inp / "games-2026-03-20.csv", "w", newline="", encoding="utf-8") as f:
            f.write("Name,Type,Mechanism,Game Information,\n")
            f.write("Wingspan,Card,Engine Building,https://bgg.com/1,\n")
        sources.run_source(sources.SOURCES["games"])
        game = load_output(out, "games")["games"][0]
        assert game["name"] == "Wingspan"
        assert "" not in game


class TestGetLatestSwimmingData:
    def _row(self, event):
        return {
            "EVENT": event,
            "SWIM TIME": "58.12",
            "AGE": "20",
            "MEET": "M",
            "SWIM DATE": "2023-05-01",
            "LSC": "MA",
            "TEAM": "T",
            "POINTS": "0",
            "TIME STANDARD": "A",
        }

    def test_event_decoded(self, dirs):
        inp, out = dirs
        write_csv(inp / "swim_times-2023-05-01.csv", [self._row("100 FR SCY")])
        sources.run_source(sources.SOURCES["swimming"])
        event = load_output(out, "swimming")["times"][0]["event"]
        assert event["stroke"] == "Freestyle"
        assert event["unit"] == "Yard"

    def test_meter_long_course(self, dirs):
        inp, out = dirs
        write_csv(inp / "swim_times-2023-07-01.csv", [self._row("200 BR LCM")])
        sources.run_source(sources.SOURCES["swimming"])
        event = load_output(out, "swimming")["times"][0]["event"]
        assert event["unit"] == "Meter"
        assert event["course"] == "Long"


class TestGetLatestGoodreadsData:
    def _make_row(self, **overrides):
        base = {
            "Book Id": "1",
            "Title": "Test Book",
            "Author": "Test Author",
            "Author l-f": "Author, Test",
            "Additional Authors": "",
            "ISBN": '=""',
            "ISBN13": '=""',
            "My Rating": "4",
            "Average Rating": "3.9",
            "Publisher": "Publisher",
            "Binding": "Paperback",
            "Number of Pages": "300",
            "Year Published": "2020",
            "Original Publication Year": "2020",
            "Date Added": "2023/01/01",
            "Bookshelves": "",
            "Bookshelves with positions": "",
            "Exclusive Shelf": "read",
            "My Review": "",
            "Spoiler": "",
            "Private Notes": "",
            "Read Count": "1",
            "Owned Copies": "0",
            "Date Read": "2023/06/15",
        }
        base.update(overrides)
        return base

    def test_grouping_and_shape(self, dirs):
        inp, out = dirs
        rows = [
            self._make_row(Title="Read Book"),
            self._make_row(
                Title="To Read", **{"Exclusive Shelf": "to_read", "Date Read": ""}
            ),
        ]
        write_csv(inp / "goodreads-2025-05-27.csv", rows)
        sources.run_source(sources.SOURCES["books"])
        data = load_output(out, "books")
        assert "to_read" not in data
        assert len(data["read"]) == 1
        assert data["read"][0]["title"] == "Read Book"

    def test_owned_shelf_populated(self, dirs):
        inp, out = dirs
        rows = [
            self._make_row(Title="Owned Book", Bookshelves="own"),
            self._make_row(Title="Not Owned"),
            self._make_row(
                Title="WTR", **{"Exclusive Shelf": "to_read", "Date Read": ""}
            ),
        ]
        write_csv(inp / "goodreads-2025-05-27.csv", rows)
        sources.run_source(sources.SOURCES["books"])
        data = load_output(out, "books")
        assert len(data["owned"]) == 1
        assert data["owned"][0]["title"] == "Owned Book"


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
    """Integration tests for generate_lastfm_insights()."""

    EXCLUDED = list(sources.EXCLUDED_LASTFM_ARTISTS)

    @pytest.fixture()
    def site_dirs(self, tmp_path, monkeypatch):
        """Set up input, output, and a minimal site-root with static/data/."""
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
        """Write a headerless Last.fm-style CSV (artist,album,song,scrobbled_at)."""
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
        # Mon 2023-01-02 week: two Karma Police plays + one No Surprises
        # Mon 2023-01-09 week: one Karma Police play
        rows = [
            [
                "Radiohead",
                "OK Computer",
                "Karma Police",
                "02 Jan 2023 12:00",
            ],  # Mon Jan 2
            [
                "Radiohead",
                "OK Computer",
                "Karma Police",
                "04 Jan 2023 08:30",
            ],  # Wed Jan 4 (same week)
            [
                "Radiohead",
                "OK Computer",
                "Karma Police",
                "10 Jan 2023 22:00",
            ],  # Tue Jan 10 → week Jan 9
            [
                "Radiohead",
                "OK Computer",
                "No Surprises",
                "03 Jan 2023 10:00",
            ],  # Tue Jan 3 (same week as first)
        ]
        self._write_csv(inp / "lastfm-2023-01-31.csv", rows)
        sources.generate_lastfm_insights()
        data = self._load_output(site)

        assert "2023-01-02" in data["weeks"]
        assert "2023-01-09" in data["weeks"]
        assert data["weeks"] == sorted(data["weeks"]), "weeks must be sorted"

        w1_idx = data["weeks"].index("2023-01-02")
        w2_idx = data["weeks"].index("2023-01-09")

        artist_idx = data["artists"].index("Radiohead")
        album_idx = data["albums"].index("OK Computer")
        kp_song = data["songs"].index("Karma Police")
        ns_song = data["songs"].index("No Surprises")

        kp_track = next(
            i
            for i, t in enumerate(data["tracks"])
            if t == [artist_idx, album_idx, kp_song]
        )
        ns_track = next(
            i
            for i, t in enumerate(data["tracks"])
            if t == [artist_idx, album_idx, ns_song]
        )

        plays_by_key = {(p[0], p[1]): p[2] for p in data["plays"]}
        assert plays_by_key[(kp_track, w1_idx)] == 2
        assert plays_by_key[(kp_track, w2_idx)] == 1
        assert plays_by_key[(ns_track, w1_idx)] == 1

    def test_excluded_artists_removed(self, site_dirs):
        inp, site = site_dirs
        rows = [
            ["Radiohead", "OK Computer", "Karma Police", "01 Jan 2023 12:00"],
        ]
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
        """When no CSV is present, generate_lastfm_insights should log a warning, not crash."""
        # inp is empty — no CSV placed
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

        # Every track's indices must point to valid entries
        for track in data["tracks"]:
            ai, li, si = track
            assert 0 <= ai < len(data["artists"])
            assert 0 <= li < len(data["albums"])
            assert 0 <= si < len(data["songs"])

        # Every week entry must be a valid YYYY-MM-DD Monday date
        for week in data["weeks"]:
            assert len(week) == 10 and week[4] == "-" and week[7] == "-"

        # Every play's indices must be valid
        for play in data["plays"]:
            ti, wi, count = play
            assert 0 <= ti < len(data["tracks"])
            assert 0 <= wi < len(data["weeks"])
            assert count > 0


# ============================================================================
# Last.fm API fetch tests
# ============================================================================


class _FakeResponse:
    """Minimal requests.Response stand-in for monkeypatching."""

    def __init__(self, payload: dict):
        self._payload = payload

    def raise_for_status(self):
        pass

    def json(self) -> dict:
        return self._payload


def _make_api_response(tracks: list[dict], page: int = 1, total_pages: int = 1) -> dict:
    """Build a minimal user.getRecentTracks API response payload."""
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
    """Construct a minimal Last.fm track dict."""
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


class TestFetchLastfmScrobbles:
    """Unit tests for fetch_lastfm_scrobbles(), with requests.get monkeypatched."""

    @pytest.fixture()
    def api_dirs(self, tmp_path, monkeypatch):
        monkeypatch.setattr(config, "INPUT_DATA_DIR", str(tmp_path))
        monkeypatch.setenv("LASTFM_API_KEY", "fake-key")
        monkeypatch.setenv("LASTFM_USER", "testuser")
        return tmp_path

    def test_basic_row_shape(self, api_dirs, monkeypatch):
        """Returned rows have the expected four fields (plus uts)."""
        payload = _make_api_response(
            [
                _make_track("Radiohead", "OK Computer", "Karma Police", 1672574400),
            ]
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
        """scrobbled_at must parse back through _LASTFM_TS_FORMAT without error."""
        uts = 1672574400
        payload = _make_api_response([_make_track("A", "B", "C", uts)])
        monkeypatch.setattr("requests.get", lambda *a, **kw: _FakeResponse(payload))

        rows = sources.fetch_lastfm_scrobbles()

        from datetime import datetime

        # should not raise
        datetime.strptime(rows[0]["scrobbled_at"], sources._LASTFM_TS_FORMAT)

    def test_nowplaying_track_skipped(self, api_dirs, monkeypatch):
        """Tracks with nowplaying=true must not appear in the output."""
        payload = _make_api_response(
            [
                _make_track(
                    "Radiohead",
                    "OK Computer",
                    "Karma Police",
                    1672574400,
                    nowplaying=True,
                ),
                _make_track("Radiohead", "OK Computer", "No Surprises", 1672578000),
            ]
        )
        monkeypatch.setattr("requests.get", lambda *a, **kw: _FakeResponse(payload))

        rows = sources.fetch_lastfm_scrobbles()

        assert len(rows) == 1
        assert rows[0]["song"] == "No Surprises"

    def test_cache_file_written(self, api_dirs, monkeypatch):
        """Cache JSON file must exist with last_uts and scrobbles after a fetch."""
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
        """Second run passes from=last_uts+1 so only new scrobbles are requested."""
        uts1 = 1672574400
        uts2 = 1672660800

        calls: list[dict] = []

        def fake_get(url, params=None, **kw):
            calls.append(dict(params or {}))
            # First real call returns uts1, second returns uts2
            if len(calls) == 1:
                return _FakeResponse(
                    _make_api_response([_make_track("A", "B", "C", uts1)])
                )
            return _FakeResponse(_make_api_response([_make_track("A", "B", "D", uts2)]))

        monkeypatch.setattr("requests.get", fake_get)

        sources.fetch_lastfm_scrobbles()  # first run — no watermark
        sources.fetch_lastfm_scrobbles()  # second run — should pass from=uts1+1

        assert len(calls) == 2
        assert calls[1].get("from") == uts1 + 1

    def test_incremental_deduplicates(self, api_dirs, monkeypatch):
        """Rows already in the cache must not be duplicated on a second fetch."""
        uts = 1672574400

        payload = _make_api_response([_make_track("A", "B", "C", uts)])
        monkeypatch.setattr("requests.get", lambda *a, **kw: _FakeResponse(payload))

        sources.fetch_lastfm_scrobbles()
        rows = sources.fetch_lastfm_scrobbles()  # same track returned again

        assert len(rows) == 1  # not duplicated

    def test_missing_env_raises(self, tmp_path, monkeypatch):
        """ValueError is raised (and logged) when credentials are absent."""
        monkeypatch.setattr(config, "INPUT_DATA_DIR", str(tmp_path))
        monkeypatch.delenv("LASTFM_API_KEY", raising=False)
        monkeypatch.delenv("LASTFM_USER", raising=False)

        with pytest.raises(ValueError, match="LASTFM"):
            sources.fetch_lastfm_scrobbles()

    def test_single_track_response_coerced(self, api_dirs, monkeypatch):
        """A single-track payload (dict, not list) is handled without error."""
        uts = 1672574400
        # Pass a plain dict instead of a list
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
        """An API response with no tracks returns an empty list without error."""
        payload = _make_api_response([])
        monkeypatch.setattr("requests.get", lambda *a, **kw: _FakeResponse(payload))

        rows = sources.fetch_lastfm_scrobbles()
        assert rows == []


# ============================================================================
# Helpers for the new incremental API/RSS fetchers
# ============================================================================


class _FakeXMLResponse:
    """Minimal requests.Response stub that returns XML text."""

    def __init__(self, text: str):
        self.text = text

    def raise_for_status(self):
        pass


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


def _make_letterboxd_rss(items: list[dict]) -> str:
    """Build a minimal Letterboxd RSS XML string."""
    item_xml = ""
    for it in items:
        item_xml += "    <item>\n"
        for key, val in it.items():
            item_xml += f"      <{key}>{val}</{key}>\n"
        item_xml += "    </item>\n"
    return (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<rss version="2.0" xmlns:letterboxd="https://letterboxd.com">\n'
        "  <channel>\n"
        "    <title>Test Diary</title>\n"
        + item_xml
        + "  </channel>\n</rss>"
    )


def _make_letterboxd_item(
    guid: str,
    title: str,
    year: str,
    watched: str,
    rating: str = "4.0",
    review: str = "",
) -> dict:
    return {
        "guid": guid,
        "link": f"https://letterboxd.com/test/film/{title.lower().replace(' ', '-')}/",
        "letterboxd:watchedDate": watched,
        "letterboxd:filmTitle": title,
        "letterboxd:filmYear": year,
        "letterboxd:memberRating": rating,
        "description": f"&lt;p&gt;{review}&lt;/p&gt;" if review else "",
    }


def _make_goodreads_rss(items: list[dict]) -> str:
    """Build a minimal Goodreads shelf RSS XML string."""
    item_xml = ""
    for it in items:
        item_xml += "    <item>\n"
        for key, val in it.items():
            if key == "_book_pages":
                item_xml += f"      <book><num_pages>{val}</num_pages></book>\n"
            else:
                item_xml += f"      <{key}><![CDATA[{val}]]></{key}>\n"
        item_xml += "    </item>\n"
    return (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<rss version="2.0">\n'
        "  <channel>\n"
        "    <title>Goodreads: shelf</title>\n"
        + item_xml
        + "  </channel>\n</rss>"
    )


def _make_goodreads_item(
    title: str = "Piranesi",
    author: str = "Susanna Clarke",
    rating: str = "5",
    read_at: str = "Mon Mar 24 00:00:00 -0800 2026",
    pages: str = "245",
) -> dict:
    return {
        "title": title,
        "author_name": author,
        "user_rating": rating,
        "user_read_at": read_at,
        "user_date_added": "Sun Jul 13 00:00:00 -0700 2025",
        "average_rating": "4.21",
        "book_published": "2020",
        "isbn": "163557563X",
        "user_shelves": "read",
        "user_review": "",
        "_book_pages": pages,
    }


# ============================================================================
# transform_trakt_export — watched_date key
# ============================================================================


class TestTransformTraktExportWatchedDate:
    """Verify the episode key is 'watched_date', not 'date'."""

    def test_episode_key_is_watched_date(self):
        raw = _make_trakt_shows(1)
        result = sources.transform_trakt_export(raw)
        episode = result[0]["seasons"][0]["watched"][0]
        assert "watched_date" in episode, "episode must have 'watched_date' key"
        assert "date" not in episode, "old 'date' key must not be present"
        assert episode["watched_date"] == "2024-01-01T00:00:00.000Z"


# ============================================================================
# fetch_trakt_watched_shows
# ============================================================================


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


# ============================================================================
# fetch_letterboxd_diary
# ============================================================================


class TestFetchLetterboxdDiary:
    @pytest.fixture()
    def api_dirs(self, tmp_path, monkeypatch):
        monkeypatch.setattr(config, "INPUT_DATA_DIR", str(tmp_path))
        monkeypatch.setenv("LETTERBOXD_USER", "testuser")
        return tmp_path

    def test_basic_row_shape(self, api_dirs, monkeypatch):
        """Returned rows have the expected field keys."""
        item = _make_letterboxd_item("guid-1", "Parasite", "2019", "2024-01-15", "5.0")
        xml = _make_letterboxd_rss([item])
        monkeypatch.setattr("requests.get", lambda *a, **kw: _FakeXMLResponse(xml))

        rows = sources.fetch_letterboxd_diary()

        assert len(rows) == 1
        row = rows[0]
        assert row["name"] == "Parasite"
        assert row["year"] == "2019"
        assert row["date"] == "2024-01-15"
        assert row["rating"] == "5.0"
        assert "letterboxd_uri" in row
        assert "_guid" in row

    def test_non_diary_items_skipped(self, api_dirs, monkeypatch):
        """Items without letterboxd:watchedDate (lists, watchlists) are ignored."""
        diary_item = _make_letterboxd_item("guid-1", "Parasite", "2019", "2024-01-15")
        list_item = {"guid": "guid-list", "link": "https://letterboxd.com/test/list/faves/"}
        xml = _make_letterboxd_rss([diary_item, list_item])
        monkeypatch.setattr("requests.get", lambda *a, **kw: _FakeXMLResponse(xml))

        rows = sources.fetch_letterboxd_diary()
        assert len(rows) == 1
        assert rows[0]["name"] == "Parasite"

    def test_dedup_by_guid(self, api_dirs, monkeypatch):
        """An entry already in the cache is not duplicated on a second fetch."""
        item = _make_letterboxd_item("guid-1", "Parasite", "2019", "2024-01-15")
        xml = _make_letterboxd_rss([item])
        monkeypatch.setattr("requests.get", lambda *a, **kw: _FakeXMLResponse(xml))

        sources.fetch_letterboxd_diary()
        rows = sources.fetch_letterboxd_diary()  # same item returned again

        assert len(rows) == 1  # not duplicated

    def test_new_item_appended(self, api_dirs, monkeypatch):
        """A brand-new guid from the feed is merged into the cached entries."""
        item1 = _make_letterboxd_item("guid-1", "Parasite", "2019", "2024-01-15")
        item2 = _make_letterboxd_item("guid-2", "Knives Out", "2019", "2024-01-20")

        xmls = [_make_letterboxd_rss([item1]), _make_letterboxd_rss([item1, item2])]
        call_count = {"n": 0}

        def fake_get(*a, **kw):
            resp = _FakeXMLResponse(xmls[call_count["n"]])
            call_count["n"] += 1
            return resp

        monkeypatch.setattr("requests.get", fake_get)

        sources.fetch_letterboxd_diary()
        rows = sources.fetch_letterboxd_diary()

        assert len(rows) == 2

    def test_cache_written(self, api_dirs, monkeypatch):
        """Cache file is created with a 'watched' list after a fetch."""
        item = _make_letterboxd_item("guid-1", "Parasite", "2019", "2024-01-15")
        xml = _make_letterboxd_rss([item])
        monkeypatch.setattr("requests.get", lambda *a, **kw: _FakeXMLResponse(xml))

        sources.fetch_letterboxd_diary()

        cache_path = api_dirs / sources.LETTERBOXD_CACHE_FILENAME
        assert cache_path.exists()
        cache = json.loads(cache_path.read_text(encoding="utf-8"))
        assert "watched" in cache
        assert len(cache["watched"]) == 1

    def test_html_stripped_from_review(self, api_dirs, monkeypatch):
        """HTML tags are removed from the review field."""
        item = _make_letterboxd_item(
            "guid-1", "Parasite", "2019", "2024-01-15", review="Great film!"
        )
        xml = _make_letterboxd_rss([item])
        monkeypatch.setattr("requests.get", lambda *a, **kw: _FakeXMLResponse(xml))

        rows = sources.fetch_letterboxd_diary()
        assert rows[0].get("review") == "Great film!"

    def test_missing_env_raises(self, tmp_path, monkeypatch):
        monkeypatch.setattr(config, "INPUT_DATA_DIR", str(tmp_path))
        monkeypatch.delenv("LETTERBOXD_USER", raising=False)

        with pytest.raises(ValueError, match="LETTERBOXD"):
            sources.fetch_letterboxd_diary()


# ============================================================================
# fetch_goodreads_shelves
# ============================================================================


class TestFetchGoodreadsShelves:
    @pytest.fixture()
    def api_dirs(self, tmp_path, monkeypatch):
        monkeypatch.setattr(config, "INPUT_DATA_DIR", str(tmp_path))
        monkeypatch.setenv("GOODREADS_USER_ID", "12345678")
        return tmp_path

    def test_basic_row_shape(self, api_dirs, monkeypatch):
        """Returned records have the expected field names matching media/books.json."""
        item = _make_goodreads_item()
        xml = _make_goodreads_rss([item])
        monkeypatch.setattr("requests.get", lambda *a, **kw: _FakeXMLResponse(xml))

        result = sources.fetch_goodreads_shelves()

        assert "read" in result
        assert "currently_reading" in result
        assert "owned" in result
        # All three shelf fetches return the same one-item page
        record = result["read"][0]
        assert record["title"] == "Piranesi"
        assert record["author"] == "Susanna Clarke"
        assert record["my_rating"] == "5"
        assert record["date_read"] == "2026/03/24"
        assert record["exclusive_shelf"] == "read"
        assert "number_of_pages" in record

    def test_pagination_stops_on_short_page(self, api_dirs, monkeypatch):
        """Pagination stops when the page has fewer items than per_page."""
        xml = _make_goodreads_rss([_make_goodreads_item()])
        call_count = {"n": 0}

        def fake_get(*a, **kw):
            call_count["n"] += 1
            return _FakeXMLResponse(xml)

        monkeypatch.setattr("requests.get", fake_get)
        # per_page=100, only 1 item → stops after page 1
        result = sources._fetch_goodreads_shelf("12345678", "read", per_page=100)

        assert call_count["n"] == 1
        assert len(result) == 1

    def test_date_format_converted(self, api_dirs, monkeypatch):
        """Goodreads RSS date strings are converted to YYYY/MM/DD."""
        item = _make_goodreads_item(read_at="Sat Mar 24 00:00:00 -0800 2026")
        xml = _make_goodreads_rss([item])
        monkeypatch.setattr("requests.get", lambda *a, **kw: _FakeXMLResponse(xml))

        result = sources.fetch_goodreads_shelves()
        assert result["read"][0]["date_read"] == "2026/03/24"

    def test_empty_read_at_yields_empty_date(self, api_dirs, monkeypatch):
        """An empty user_read_at (e.g. currently-reading) produces an empty date_read."""
        item = _make_goodreads_item(read_at="")
        xml = _make_goodreads_rss([item])
        monkeypatch.setattr("requests.get", lambda *a, **kw: _FakeXMLResponse(xml))

        result = sources.fetch_goodreads_shelves()
        assert result["read"][0]["date_read"] == ""

    def test_missing_env_raises(self, tmp_path, monkeypatch):
        monkeypatch.setattr(config, "INPUT_DATA_DIR", str(tmp_path))
        monkeypatch.delenv("GOODREADS_USER_ID", raising=False)

        with pytest.raises(ValueError, match="GOODREADS"):
            sources.fetch_goodreads_shelves()


# ============================================================================
# _parse_goodreads_date helper
# ============================================================================


class TestParseGoodreadsDate:
    def test_standard_date(self):
        assert sources._parse_goodreads_date("Sat Mar 24 00:00:00 -0800 2026") == "2026/03/24"

    def test_single_digit_day_with_leading_space(self):
        # Single-digit days have a leading space in the Goodreads format
        assert sources._parse_goodreads_date("Thu Jan  1 00:00:00 -0700 2026") == "2026/01/01"

    def test_empty_string_returns_empty(self):
        assert sources._parse_goodreads_date("") == ""

    def test_invalid_string_returns_empty(self):
        assert sources._parse_goodreads_date("not a date") == ""


# ============================================================================
# _is_publish_commit helper
# ============================================================================


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


# ============================================================================
# generate_activity_feed — publish commit deduplication
# ============================================================================


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


# ============================================================================
# transform_fragrance_rows
# ============================================================================


class TestTransformFragranceRows:
    def _own_rows(self):
        return [
            {
                "Name": "Bleu de Chanel",
                "Maker": "Chanel",
                "Type": "Eau De Parfum",
                "Profile": "https://example.com",
                "My Thoughts": "Great",
                "Price": "$120",
                "Notes": "gift",
            }
        ]

    def _want_rows(self):
        return [
            {
                "Name": "Aventus",
                "Maker": "Creed",
                "Type": "Eau De Parfum",
                "Profile": "https://example.com",
                "My Thoughts": "",
                "Price": "$400",
                "Notes": "someday",
            }
        ]

    def test_price_and_notes_dropped(self):
        result = sources.transform_fragrance_rows(self._own_rows(), self._want_rows())
        for item in result["own"] + result["want"]:
            assert "price" not in item
            assert "notes" not in item

    def test_headers_snake_cased(self):
        result = sources.transform_fragrance_rows(self._own_rows(), self._want_rows())
        own = result["own"][0]
        assert "name" in own
        assert "maker" in own
        assert "my_thoughts" in own

    def test_own_and_want_split(self):
        result = sources.transform_fragrance_rows(self._own_rows(), self._want_rows())
        assert result["own"][0]["name"] == "Bleu de Chanel"
        assert result["want"][0]["name"] == "Aventus"

    def test_empty_lists_handled(self):
        result = sources.transform_fragrance_rows([], [])
        assert result == {"own": [], "want": []}


# ============================================================================
# _parse_lifting_workout + transform_lifting_events
# ============================================================================


def _make_calendar_event(
    event_id: str,
    summary: str,
    description: str,
    date_time: str = "2026-01-07T10:00:00-05:00",
    status: str = "confirmed",
) -> dict:
    return {
        "id": event_id,
        "summary": summary,
        "description": description,
        "start": {"dateTime": date_time},
        "status": status,
    }


_PUSH_DESCRIPTION = (
    "Chest Press (3x10 @ 30lbs)\n"
    "Incline Fly (3x12 @ 20lbs)\n"
    "Tricep Pushdown: 3x15 @ 25lbs\n"
)


class TestParseLiftingWorkout:
    def test_returns_none_for_non_workout(self):
        assert sources._parse_lifting_workout("dentist appointment", None, None) is None

    def test_returns_none_if_description_missing(self):
        assert sources._parse_lifting_workout("push workout", None, None) is None

    def test_push_type_detected(self):
        from datetime import datetime
        dt = datetime(2026, 1, 7, 10, 0)
        result = sources._parse_lifting_workout("push workout", _PUSH_DESCRIPTION, dt)
        assert result is not None
        assert result["type"] == "push"

    def test_pull_type_detected(self):
        from datetime import datetime
        dt = datetime(2026, 1, 9, 10, 0)
        desc = "Pull Up (3x8 @ 0lbs)\nBicep Curl (3x12 @ 20lbs)\n"
        result = sources._parse_lifting_workout("pull workout", desc, dt)
        assert result is not None
        assert result["type"] == "pull"

    def test_full_body_a_detected(self):
        from datetime import datetime
        dt = datetime(2026, 1, 11, 9, 0)
        desc = "Squat (3x10 @ 45lbs)\n"
        result = sources._parse_lifting_workout("full body a workout", desc, dt)
        assert result is not None
        assert result["type"] == "full body a"

    def test_date_and_time_formatted(self):
        from datetime import datetime
        dt = datetime(2026, 1, 7, 10, 30)
        result = sources._parse_lifting_workout("push workout", _PUSH_DESCRIPTION, dt)
        assert result["date"] == "2026-01-07"
        assert result["time"] == "10:30"

    def test_exercises_parsed(self):
        from datetime import datetime
        dt = datetime(2026, 1, 7, 10, 0)
        result = sources._parse_lifting_workout("push workout", _PUSH_DESCRIPTION, dt)
        assert len(result["exercises"]) == 3
        names = [e["name"] for e in result["exercises"]]
        assert "Chest Press" in names

    def test_treadmill_truncates_exercises(self):
        from datetime import datetime
        dt = datetime(2026, 1, 7, 10, 0)
        desc = "Chest Press (3x10 @ 30lbs)\ntreadmill 20 min\nShoulder Press (3x10 @ 20lbs)\n"
        result = sources._parse_lifting_workout("push workout", desc, dt)
        assert len(result["exercises"]) == 1

    def test_skipped_line_ignored(self):
        from datetime import datetime
        dt = datetime(2026, 1, 7, 10, 0)
        desc = "Chest Press (3x10 @ 30lbs)\nskipped Fly\nTricep Pushdown: 3x15 @ 25lbs\n"
        result = sources._parse_lifting_workout("push workout", desc, dt)
        names = [e["name"] for e in result["exercises"]]
        assert not any("skipped" in n.lower() for n in names)
        assert len(result["exercises"]) == 2


class TestTransformLiftingEvents:
    def test_workout_event_included(self):
        events = [_make_calendar_event("e1", "push workout", _PUSH_DESCRIPTION)]
        result = sources.transform_lifting_events(events)
        assert len(result["workouts"]) == 1
        assert result["workouts"][0]["type"] == "push"

    def test_non_workout_event_skipped(self):
        events = [
            _make_calendar_event("e1", "push workout", _PUSH_DESCRIPTION),
            _make_calendar_event("e2", "dentist appointment", "Dr Smith"),
        ]
        result = sources.transform_lifting_events(events)
        assert len(result["workouts"]) == 1

    def test_missing_description_skipped(self):
        event = _make_calendar_event("e1", "push workout", "")
        event.pop("description")
        result = sources.transform_lifting_events([event])
        assert result["workouts"] == []

    def test_all_day_event_date_parsed(self):
        event = {
            "id": "e1",
            "summary": "push workout",
            "description": _PUSH_DESCRIPTION,
            "start": {"date": "2026-01-07"},
            "status": "confirmed",
        }
        result = sources.transform_lifting_events([event])
        assert len(result["workouts"]) == 1
        assert result["workouts"][0]["date"] == "2026-01-07"

    def test_output_wrapped(self):
        result = sources.transform_lifting_events([])
        assert "workouts" in result


# ============================================================================
# fetch_calendar_events — delta sync via syncToken
# ============================================================================


class _FakeCalendarResponse:
    def __init__(self, items: list[dict], next_sync_token: str | None = None):
        self._items = items
        self._next_sync_token = next_sync_token

    def execute(self) -> dict:
        result: dict = {"items": self._items}
        if self._next_sync_token:
            result["nextSyncToken"] = self._next_sync_token
        return result


class _FakeCalendarService:
    def __init__(self, responses: list[_FakeCalendarResponse]):
        self._responses = list(responses)
        self._calls: list[dict] = []

    def events(self):
        return self

    def list(self, **params):
        self._calls.append(params)
        return self._responses.pop(0)


class TestFetchCalendarEvents:
    @pytest.fixture()
    def cal_dirs(self, tmp_path, monkeypatch):
        monkeypatch.setattr(sources.config, "INPUT_DATA_DIR", str(tmp_path))
        monkeypatch.setenv("LIFTING_CALENDAR_ID", "primary")
        monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", str(tmp_path / "fake-key.json"))
        (tmp_path / "fake-key.json").write_text("{}")
        return tmp_path

    def _patch_creds(self, monkeypatch):
        monkeypatch.setattr(sources, "_google_credentials", lambda _scopes: None)

    def test_sync_token_stored_after_first_run(self, cal_dirs, monkeypatch):
        self._patch_creds(monkeypatch)
        svc = _FakeCalendarService([
            _FakeCalendarResponse(
                [_make_calendar_event("e1", "push workout", _PUSH_DESCRIPTION)],
                next_sync_token="tok-1",
            )
        ])
        monkeypatch.setattr(sources, "build", lambda *a, **kw: svc)

        sources.fetch_calendar_events()

        cache = json.loads((cal_dirs / sources.CALENDAR_API_CACHE_FILENAME).read_text())
        assert cache["sync_token"] == "tok-1"
        assert "e1" in cache["events"]

    def test_sync_token_reused_on_second_run(self, cal_dirs, monkeypatch):
        self._patch_creds(monkeypatch)
        svc = _FakeCalendarService([
            _FakeCalendarResponse(
                [_make_calendar_event("e1", "push workout", _PUSH_DESCRIPTION)],
                next_sync_token="tok-1",
            ),
            _FakeCalendarResponse([], next_sync_token="tok-2"),
        ])
        monkeypatch.setattr(sources, "build", lambda *a, **kw: svc)

        sources.fetch_calendar_events()
        sources.fetch_calendar_events()

        assert svc._calls[1].get("syncToken") == "tok-1"

    def test_cancelled_event_removed_from_cache(self, cal_dirs, monkeypatch):
        self._patch_creds(monkeypatch)
        svc = _FakeCalendarService([
            _FakeCalendarResponse(
                [_make_calendar_event("e1", "push workout", _PUSH_DESCRIPTION)],
                next_sync_token="tok-1",
            ),
            _FakeCalendarResponse(
                [{"id": "e1", "status": "cancelled"}],
                next_sync_token="tok-2",
            ),
        ])
        monkeypatch.setattr(sources, "build", lambda *a, **kw: svc)

        sources.fetch_calendar_events()
        events = sources.fetch_calendar_events()

        assert not any(e.get("id") == "e1" for e in events)

    def test_410_triggers_full_resync(self, cal_dirs, monkeypatch):
        from unittest.mock import MagicMock
        from googleapiclient.errors import HttpError as _HttpError

        self._patch_creds(monkeypatch)

        cache_path = cal_dirs / sources.CALENDAR_API_CACHE_FILENAME
        cache_path.write_text(
            json.dumps({"sync_token": "stale-token", "events": {}}), encoding="utf-8"
        )

        resp_410 = MagicMock()
        resp_410.status = 410
        err_410 = _HttpError(resp=resp_410, content=b"Gone")

        call_count = {"n": 0}

        class _Svc410:
            def events(self):
                return self

            def list(self, **params):
                call_count["n"] += 1
                if call_count["n"] == 1:
                    class _Raise:
                        def execute(self):
                            raise err_410
                    return _Raise()
                return _FakeCalendarResponse(
                    [_make_calendar_event("e2", "pull workout", "Pull Up (3x8 @ 0lbs)\n")],
                    next_sync_token="tok-new",
                )

        monkeypatch.setattr(sources, "build", lambda *a, **kw: _Svc410())

        events = sources.fetch_calendar_events()

        assert any(e.get("id") == "e2" for e in events)
        cache = json.loads(cache_path.read_text())
        assert cache["sync_token"] == "tok-new"

    def test_missing_calendar_id_raises(self, tmp_path, monkeypatch):
        monkeypatch.setattr(sources.config, "INPUT_DATA_DIR", str(tmp_path))
        monkeypatch.delenv("LIFTING_CALENDAR_ID", raising=False)
        monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", str(tmp_path / "k.json"))

        with pytest.raises(ValueError, match="LIFTING_CALENDAR_ID"):
            sources.fetch_calendar_events()

    def test_missing_service_account_file_raises(self, tmp_path, monkeypatch):
        monkeypatch.setattr(sources.config, "INPUT_DATA_DIR", str(tmp_path))
        monkeypatch.setenv("LIFTING_CALENDAR_ID", "primary")
        monkeypatch.delenv("GOOGLE_SERVICE_ACCOUNT_FILE", raising=False)

        with pytest.raises(ValueError, match="GOOGLE_SERVICE_ACCOUNT_FILE"):
            sources.fetch_calendar_events()


# ============================================================================
# Sheets API orchestrators — monkeypatch fetch_google_sheet_records
# ============================================================================


class TestSheetsOrchestrators:
    @pytest.fixture()
    def dirs(self, tmp_path, monkeypatch):
        inp = tmp_path / "input"
        out = tmp_path / "output"
        inp.mkdir()
        out.mkdir()
        monkeypatch.setattr(sources.config, "INPUT_DATA_DIR", str(inp))
        monkeypatch.setattr(sources.config, "OUTPUT_DATA_DIR", str(out))
        return inp, out

    def _game_rows(self):
        return [{"Name": "Wingspan", "Type": "Card", "Mechanism": "Engine Building",
                 "Game Information": "https://example.com", "": ""}]

    def _record_rows(self):
        return [{
            "Album Name": "OK Computer", "Artist Name": "Radiohead",
            "Year Released": "1997", "Date Purchased": "7/18/2023",
            "Date Received": "", "Lead Time": "", "Record Cost": "",
            "Shipping Cost": "", "Tax": "", "Total Cost": "",
            "Retailer Name": "", "Online/Physical": "", "Location": "",
        }]

    def _fragrance_own_rows(self):
        return [{"Name": "Bleu", "Maker": "Chanel", "Type": "EDP",
                 "Profile": "", "My Thoughts": "good", "Price": "100", "Notes": ""}]

    def _fragrance_want_rows(self):
        return [{"Name": "Aventus", "Maker": "Creed", "Type": "EDP",
                 "Profile": "", "My Thoughts": "", "Price": "400", "Notes": ""}]

    def test_games_api_shape(self, dirs, monkeypatch):
        _, out = dirs
        monkeypatch.setattr(sources, "fetch_google_sheet_records",
                            lambda *a, **kw: self._game_rows())
        sources.get_games_data_api()
        data = load_output(out, "games")
        assert "games" in data
        game = data["games"][0]
        assert game["name"] == "Wingspan"
        assert "" not in game

    def test_records_api_shape(self, dirs, monkeypatch):
        _, out = dirs
        monkeypatch.setattr(sources, "fetch_google_sheet_records",
                            lambda *a, **kw: self._record_rows())
        sources.get_records_data_api()
        data = load_output(out, "records")
        assert data["owned"][0]["date"] == "2023-07-18"
        assert data["owned"][0]["album_name"] == "OK Computer"

    def test_fragrance_api_shape(self, dirs, monkeypatch):
        _, out = dirs

        def _fake_fetch(sheet_id_env, worksheet=None):
            if worksheet == "Own":
                return self._fragrance_own_rows()
            return self._fragrance_want_rows()

        monkeypatch.setattr(sources, "fetch_google_sheet_records", _fake_fetch)
        sources.get_fragrance_data_api()
        data = load_output(out, "fragrance")
        assert data["own"][0]["name"] == "Bleu"
        assert data["want"][0]["name"] == "Aventus"
        for item in data["own"] + data["want"]:
            assert "price" not in item
