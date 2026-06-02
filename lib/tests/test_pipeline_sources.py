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
            "seasons": seasons or [
                {
                    "number": 1,
                    "episodes": [
                        {"number": 1, "plays": 1, "last_watched_at": "2024-01-01T20:00:00.000Z"},
                        {"number": 2, "plays": 1, "last_watched_at": "2024-01-08T20:00:00.000Z"},
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
        assert ep["date"] == "2024-01-01T20:00:00.000Z"

    def test_multiple_shows(self):
        result = sources.transform_trakt_export([self._entry("Show A"), self._entry("Show B")])
        assert [s["title"] for s in result] == ["Show A", "Show B"]

    def test_multiple_seasons(self):
        entry = self._entry(seasons=[
            {"number": 1, "episodes": [{"number": 1, "plays": 1, "last_watched_at": "2024-01-01T00:00:00.000Z"}]},
            {"number": 2, "episodes": [{"number": 1, "plays": 1, "last_watched_at": "2024-06-01T00:00:00.000Z"},
                                       {"number": 2, "plays": 1, "last_watched_at": "2024-06-08T00:00:00.000Z"}]},
        ])
        result = sources.transform_trakt_export([entry])
        seasons = result[0]["seasons"]
        assert seasons[0]["season"] == 1 and seasons[0]["episodes"] == 1
        assert seasons[1]["season"] == 2 and seasons[1]["episodes"] == 2

    def test_empty_input(self):
        assert sources.transform_trakt_export([]) == []


class TestTransformRecords:
    def _rows(self, **overrides):
        base = {
            "Album Name": "OK Computer", "Artist Name": "Radiohead",
            "Year Released": "1997", "Date Purchased": "7/18/2023",
            "Date Received": "7/24/2023", "Lead Time": "6",
            "Record Cost": "$19.99", "Shipping Cost": "$0.00",
            "Tax": "$1.20", "Total Cost": "$21.19",
            "Retailer Name": "Amazon", "Online/Physical": "Online", "Location": "N/A",
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
        rows = [{"Name": "Wingspan", "Type": "Card", "Mechanism": "Engine Building", "": ""}]
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
        rows = [{"EVENT": "100 FR SCY", "SWIM TIME": "58.12", "AGE": "20",
                 "MEET": "Spring", "SWIM DATE": "2023-05-01",
                 "LSC": "MA", "TEAM": "T1", "POINTS": "0", "TIME STANDARD": "A"}]
        result = sources.transform_swimming(rows)
        event = result["times"][0]["event"]
        assert event == {"distance": 100, "stroke": "Freestyle", "unit": "Yard", "course": "Short"}

    def test_event_decoded_meter_long(self):
        rows = [{"EVENT": "200 BR LCM", "SWIM TIME": "2:45.00", "AGE": "21",
                 "MEET": "LC Open", "SWIM DATE": "2023-07-01",
                 "LSC": "MA", "TEAM": "T1", "POINTS": "0", "TIME STANDARD": "B"}]
        result = sources.transform_swimming(rows)
        event = result["times"][0]["event"]
        assert event["unit"] == "Meter"
        assert event["course"] == "Long"
        assert event["stroke"] == "Breastroke"


class TestTransformGoodreads:
    def _make_row(self, **overrides):
        base = {
            "Book Id": "1", "Title": "Test Book", "Author": "Author Name",
            "Author l-f": "Name, Author", "Additional Authors": "",
            "ISBN": '=""', "ISBN13": '=""', "My Rating": "4",
            "Average Rating": "3.9", "Publisher": "Pub", "Binding": "Paperback",
            "Number of Pages": "300", "Year Published": "2020",
            "Original Publication Year": "2020", "Date Added": "2023/01/01",
            "Bookshelves": "", "Bookshelves with positions": "",
            "Exclusive Shelf": "read", "My Review": "", "Spoiler": "",
            "Private Notes": "", "Read Count": "1", "Owned Copies": "0",
            "Date Read": "2023/06/15",
        }
        base.update(overrides)
        return base

    def test_to_read_dropped(self):
        rows = [
            self._make_row(**{"Exclusive Shelf": "read"}),
            self._make_row(Title="Want", **{"Exclusive Shelf": "to_read", "Date Read": ""}),
        ]
        result = sources.transform_goodreads(rows)
        assert "to_read" not in result

    def test_read_grouped(self):
        rows = [
            self._make_row(Title="Book A"),
            self._make_row(Title="Book B"),
            self._make_row(Title="WTR", **{"Exclusive Shelf": "to_read", "Date Read": ""}),
        ]
        result = sources.transform_goodreads(rows)
        assert len(result["read"]) == 2

    def test_owned_populated(self):
        rows = [
            self._make_row(Title="Mine", Bookshelves="own"),
            self._make_row(Title="Not Mine"),
            self._make_row(Title="WTR", **{"Exclusive Shelf": "to_read", "Date Read": ""}),
        ]
        result = sources.transform_goodreads(rows)
        assert len(result["owned"]) == 1
        assert result["owned"][0]["title"] == "Mine"

    def test_date_field_renamed(self):
        rows = [
            self._make_row(**{"Date Read": "2023/06/15"}),
            self._make_row(Title="WTR", **{"Exclusive Shelf": "to_read", "Date Read": ""}),
        ]
        result = sources.transform_goodreads(rows)
        assert result["read"][0]["date"] == "2023/06/15"


class TestTransformLastfm:
    EXCLUDED = [
        "", "", "",
        "",
        "",
        "", "", "",
    ]

    def _base_rows(self):
        rows = [
            {"artist": "Radiohead", "album": "OK Computer", "song": "Karma Police", "scrobbled_at": "t"},
            {"artist": "Radiohead", "album": "OK Computer", "song": "Karma Police", "scrobbled_at": "t"},
            {"artist": "Radiohead", "album": "OK Computer", "song": "No Surprises",  "scrobbled_at": "t"},
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
        rows = [{
            "Album Name": "OK Computer", "Artist Name": "Radiohead",
            "Year Released": "1997", "Date Purchased": "7/18/2023",
            "Date Received": "7/24/2023", "Lead Time": "6",
            "Record Cost": "$19.99", "Shipping Cost": "$0.00",
            "Tax": "$1.20", "Total Cost": "$21.19",
            "Retailer Name": "Amazon", "Online/Physical": "Online", "Location": "N/A",
        }]
        write_csv(inp / "records-2024-08-31.csv", rows)
        sources.run_source(sources.SOURCES["records"])
        data = load_output(out, "records")
        assert data["owned"][0]["date"] == "2023-07-18"
        assert data["last_updated"]

    def test_latest_file_wins(self, dirs):
        inp, out = dirs
        base = {"Album Name": "", "Artist Name": "", "Year Released": "",
                "Date Purchased": "1/1/2020", "Date Received": "", "Lead Time": "",
                "Record Cost": "", "Shipping Cost": "", "Tax": "", "Total Cost": "",
                "Retailer Name": "", "Online/Physical": "", "Location": ""}
        write_csv(inp / "records-2023-01-01.csv", [{**base, "Album Name": "Old"}])
        write_csv(inp / "records-2024-08-31.csv", [{**base, "Album Name": "New", "Date Purchased": "6/15/2023"}])
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
        return {"EVENT": event, "SWIM TIME": "58.12", "AGE": "20", "MEET": "M",
                "SWIM DATE": "2023-05-01", "LSC": "MA", "TEAM": "T", "POINTS": "0", "TIME STANDARD": "A"}

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
            "Book Id": "1", "Title": "Test Book", "Author": "Test Author",
            "Author l-f": "Author, Test", "Additional Authors": "",
            "ISBN": '=""', "ISBN13": '=""', "My Rating": "4",
            "Average Rating": "3.9", "Publisher": "Publisher", "Binding": "Paperback",
            "Number of Pages": "300", "Year Published": "2020",
            "Original Publication Year": "2020", "Date Added": "2023/01/01",
            "Bookshelves": "", "Bookshelves with positions": "",
            "Exclusive Shelf": "read", "My Review": "", "Spoiler": "",
            "Private Notes": "", "Read Count": "1", "Owned Copies": "0",
            "Date Read": "2023/06/15",
        }
        base.update(overrides)
        return base

    def test_grouping_and_shape(self, dirs):
        inp, out = dirs
        rows = [
            self._make_row(Title="Read Book"),
            self._make_row(Title="To Read", **{"Exclusive Shelf": "to_read", "Date Read": ""}),
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
            self._make_row(Title="WTR", **{"Exclusive Shelf": "to_read", "Date Read": ""}),
        ]
        write_csv(inp / "goodreads-2025-05-27.csv", rows)
        sources.run_source(sources.SOURCES["books"])
        data = load_output(out, "books")
        assert len(data["owned"]) == 1
        assert data["owned"][0]["title"] == "Owned Book"


class TestGetLatestLastfmData:
    EXCLUDED = [
        "", "", "",
        "",
        "",
        "", "", "",
    ]

    def test_scrobble_count_and_grouping(self, dirs):
        inp, out = dirs
        rows = [
            ["Radiohead", "OK Computer", "Karma Police", "t"],
            ["Radiohead", "OK Computer", "Karma Police", "t"],
            ["Radiohead", "OK Computer", "No Surprises",  "t"],
        ]
        for a in self.EXCLUDED:
            rows.append([a, "Album", "Song", "t"])
        with open(inp / "lastfm-2024-07-08.csv", "w", newline="", encoding="utf-8") as f:
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
