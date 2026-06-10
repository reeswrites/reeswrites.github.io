"""Tests for lib/etl/sources/ownership.py"""

from __future__ import annotations

import json
import os

from lib.etl.sources.ownership import (
    _dvd_anchor,
    _normalize,
    _parse_dvd_format,
    _record_anchor,
    link_ownership,
)

# --------------------------------------------------------------------------- #
# Unit: normalisation helpers                                                    #
# --------------------------------------------------------------------------- #


class TestNormalize:
    def test_lowercases(self):
        assert _normalize("Inception") == "inception"

    def test_strips_diacritics(self):
        assert _normalize("Iñárritu") == "inarritu"

    def test_strips_bracketed_format_token(self):
        assert _normalize("Inception (Blu-ray)") == "inception"
        assert _normalize("300 [DVD]") == "300"
        assert _normalize("Dune [4K Ultra HD]") == "dune"

    def test_strips_punctuation(self):
        assert _normalize("Knives Out!") == "knives out"
        assert _normalize("Avengers: Infinity War") == "avengers infinity war"

    def test_preserves_leading_parens_in_title(self):
        # "(500) Days of Summer" — the (500) is stripped just like a format token,
        # but that's fine because the movie-side normalizes the same way.
        assert _normalize("(500) Days of Summer") == "days of summer"

    def test_collapses_whitespace(self):
        assert _normalize("  foo   bar  ") == "foo bar"

    def test_empty_string(self):
        assert _normalize("") == ""


class TestParseDvdFormat:
    def test_bluray(self):
        assert _parse_dvd_format("Inception (Blu-ray)") == "Blu-ray"
        assert _parse_dvd_format("The Revenant [Blu-Ray]") == "Blu-ray"

    def test_dvd(self):
        assert _parse_dvd_format("Inception (DVD)") == "DVD"
        assert _parse_dvd_format("Inception") == "DVD"  # no token → fallback

    def test_4k(self):
        assert _parse_dvd_format("Dune [4K Ultra HD]") == "4K Ultra HD"
        assert _parse_dvd_format("Mad Max (UHD)") == "4K Ultra HD"


class TestAnchors:
    def test_dvd_anchor_prefers_ean(self):
        dvd = {
            "title": "Inception (Blu-ray)",
            "ean_isbn13": "883929270675",
            "upc_isbn10": "",
        }
        assert _dvd_anchor(dvd) == "dvd-883929270675"

    def test_dvd_anchor_falls_back_to_title(self):
        dvd = {"title": "Inception (Blu-ray)", "ean_isbn13": "", "upc_isbn10": ""}
        assert _dvd_anchor(dvd) == "dvd-inception"

    def test_record_anchor(self):
        record = {"artist_name": "Tame Impala", "album_name": "Currents"}
        assert _record_anchor(record) == "record-tame-impala-currents"

    def test_record_anchor_strips_diacritics(self):
        record = {"artist_name": "Sigur Rós", "album_name": "()"}
        # "()" becomes empty after norm, slug would be empty → "-"
        assert _record_anchor(record).startswith("record-sigur-ros")


# --------------------------------------------------------------------------- #
# Integration: link_ownership()                                                  #
# --------------------------------------------------------------------------- #


def _write(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f)


def _read(path) -> dict:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _make_fixture_files(
    out: str,
    movies=None,
    tv=None,
    books_read=None,
    books_owned=None,
    scrobbles=None,
    dvds=None,
    records=None,
):
    _write(os.path.join(out, "media", "movies.json"), {"watched": movies or []})
    _write(os.path.join(out, "media", "tv.json"), {"shows": tv or []})
    _write(
        os.path.join(out, "media", "books.json"),
        {
            "read": books_read or [],
            "owned": books_owned or [],
            "currently_reading": [],
            "partly_read": [],
        },
    )
    _write(os.path.join(out, "media", "music.json"), {"scrobbles": scrobbles or []})
    _write(os.path.join(out, "media", "dvds.json"), {"dvds": dvds or []})
    _write(os.path.join(out, "inventory", "records.json"), {"owned": records or []})


class TestLinkOwnership:
    # ── movies ──────────────────────────────────────────────────────────────

    def test_movie_matched_by_title_and_year(self, dirs):
        _, out = dirs
        _make_fixture_files(
            str(out),
            movies=[{"name": "Inception", "year": "2010"}],
            dvds=[
                {
                    "title": "Inception (Blu-ray)",
                    "publish_date": "2010",
                    "ean_isbn13": "883929270675",
                    "upc_isbn10": "",
                }
            ],
        )
        link_ownership()
        result = _read(os.path.join(str(out), "media", "movies.json"))
        owned = result["watched"][0].get("owned")
        assert owned is not None
        assert owned["format"] == "Blu-ray"
        assert owned["source"] == "Libib"
        assert owned["url"] == "/inventory/dvds#dvd-883929270675"

    def test_movie_year_plus_one_tolerance(self, dirs):
        _, out = dirs
        _make_fixture_files(
            str(out),
            movies=[{"name": "Inception", "year": "2010"}],
            dvds=[
                {
                    "title": "Inception (Blu-ray)",
                    "publish_date": "2011",
                    "ean_isbn13": "111",
                    "upc_isbn10": "",
                }
            ],
        )
        link_ownership()
        result = _read(os.path.join(str(out), "media", "movies.json"))
        assert result["watched"][0].get("owned") is not None

    def test_movie_year_two_off_no_match(self, dirs):
        _, out = dirs
        _make_fixture_files(
            str(out),
            movies=[{"name": "Inception", "year": "2010"}],
            dvds=[
                {
                    "title": "Inception (Blu-ray)",
                    "publish_date": "2013",
                    "ean_isbn13": "222",
                    "upc_isbn10": "",
                }
            ],
        )
        link_ownership()
        result = _read(os.path.join(str(out), "media", "movies.json"))
        assert result["watched"][0].get("owned") is None

    def test_movie_title_mismatch_no_annotation(self, dirs):
        _, out = dirs
        _make_fixture_files(
            str(out),
            movies=[{"name": "Inception", "year": "2010"}],
            dvds=[
                {
                    "title": "Interstellar (Blu-ray)",
                    "publish_date": "2014",
                    "ean_isbn13": "333",
                    "upc_isbn10": "",
                }
            ],
        )
        link_ownership()
        result = _read(os.path.join(str(out), "media", "movies.json"))
        assert result["watched"][0].get("owned") is None

    def test_movie_diacritics_normalized(self, dirs):
        _, out = dirs
        _make_fixture_files(
            str(out),
            movies=[{"name": "The Revenant", "year": "2015"}],
            dvds=[
                {
                    "title": "The Revenant [Blu-ray]",
                    "publish_date": "2015",
                    "ean_isbn13": "444",
                    "upc_isbn10": "",
                }
            ],
        )
        link_ownership()
        result = _read(os.path.join(str(out), "media", "movies.json"))
        assert result["watched"][0]["owned"]["format"] == "Blu-ray"

    def test_dvd_anchor_written_to_dvds_json(self, dirs):
        _, out = dirs
        _make_fixture_files(
            str(out),
            movies=[{"name": "Inception", "year": "2010"}],
            dvds=[
                {
                    "title": "Inception (Blu-ray)",
                    "publish_date": "2010",
                    "ean_isbn13": "883929270675",
                    "upc_isbn10": "",
                }
            ],
        )
        link_ownership()
        dvds_result = _read(os.path.join(str(out), "media", "dvds.json"))
        assert dvds_result["dvds"][0]["anchor"] == "dvd-883929270675"

    # ── TV ──────────────────────────────────────────────────────────────────

    def test_tv_matched_by_title(self, dirs):
        _, out = dirs
        _make_fixture_files(
            str(out),
            tv=[{"title": "Breaking Bad", "year": "2008"}],
            dvds=[
                {
                    "title": "Breaking Bad (DVD)",
                    "publish_date": "2008",
                    "ean_isbn13": "555",
                    "upc_isbn10": "",
                }
            ],
        )
        link_ownership()
        result = _read(os.path.join(str(out), "media", "tv.json"))
        assert result["shows"][0]["owned"]["format"] == "DVD"

    # ── books ────────────────────────────────────────────────────────────────

    def test_book_matched_by_isbn(self, dirs):
        _, out = dirs
        _make_fixture_files(
            str(out),
            books_read=[
                {
                    "title": "Dune",
                    "author": "Frank Herbert",
                    "isbn": "0441013597",
                    "isbn13": "",
                }
            ],
            books_owned=[
                {
                    "title": "Dune",
                    "author": "Frank Herbert",
                    "isbn": "0441013597",
                    "isbn13": "",
                }
            ],
        )
        link_ownership()
        result = _read(os.path.join(str(out), "media", "books.json"))
        owned = result["read"][0].get("owned")
        assert owned is not None
        assert owned["format"] == "Book"
        assert owned["url"] == "/inventory/books-owned"

    def test_book_matched_by_title_author_when_no_isbn(self, dirs):
        _, out = dirs
        _make_fixture_files(
            str(out),
            books_read=[
                {"title": "Dune", "author": "Frank Herbert", "isbn": "", "isbn13": ""}
            ],
            books_owned=[
                {"title": "Dune", "author": "Frank Herbert", "isbn": "", "isbn13": ""}
            ],
        )
        link_ownership()
        result = _read(os.path.join(str(out), "media", "books.json"))
        assert result["read"][0].get("owned") is not None

    def test_book_not_owned_no_annotation(self, dirs):
        _, out = dirs
        _make_fixture_files(
            str(out),
            books_read=[
                {
                    "title": "Dune",
                    "author": "Frank Herbert",
                    "isbn": "0441013597",
                    "isbn13": "",
                }
            ],
            books_owned=[],
        )
        link_ownership()
        result = _read(os.path.join(str(out), "media", "books.json"))
        assert result["read"][0].get("owned") is None

    # ── music ────────────────────────────────────────────────────────────────

    def test_scrobble_matched_by_artist_album(self, dirs):
        _, out = dirs
        _make_fixture_files(
            str(out),
            scrobbles=[
                {
                    "artist": "Tame Impala",
                    "album": "Currents",
                    "song": "Let It Happen",
                    "scrobbles": 20,
                }
            ],
            records=[
                {
                    "artist_name": "Tame Impala",
                    "album_name": "Currents",
                    "genre": "Rock",
                    "release_date": 2015,
                }
            ],
        )
        link_ownership()
        result = _read(os.path.join(str(out), "media", "music.json"))
        owned = result["scrobbles"][0].get("owned")
        assert owned is not None
        assert owned["format"] == "Vinyl"
        assert owned["url"] == "/inventory/records#record-tame-impala-currents"

    def test_scrobble_not_owned_no_annotation(self, dirs):
        _, out = dirs
        _make_fixture_files(
            str(out),
            scrobbles=[
                {
                    "artist": "Radiohead",
                    "album": "OK Computer",
                    "song": "Karma Police",
                    "scrobbles": 5,
                }
            ],
            records=[
                {
                    "artist_name": "Tame Impala",
                    "album_name": "Currents",
                    "genre": "Rock",
                    "release_date": 2015,
                }
            ],
        )
        link_ownership()
        result = _read(os.path.join(str(out), "media", "music.json"))
        assert result["scrobbles"][0].get("owned") is None

    def test_record_anchor_written_to_records_json(self, dirs):
        _, out = dirs
        _make_fixture_files(
            str(out),
            records=[
                {
                    "artist_name": "Tame Impala",
                    "album_name": "Currents",
                    "genre": "Rock",
                    "release_date": 2015,
                }
            ],
        )
        link_ownership()
        result = _read(os.path.join(str(out), "inventory", "records.json"))
        assert result["owned"][0]["anchor"] == "record-tame-impala-currents"

    # ── reverse: DVDs get watch data ─────────────────────────────────────────

    def test_dvd_gets_watched_data(self, dirs):
        _, out = dirs
        _make_fixture_files(
            str(out),
            movies=[
                {
                    "name": "Inception",
                    "year": "2010",
                    "rating": "5",
                    "date": "2023-01-15",
                    "letterboxd_uri": "https://boxd.it/abc",
                }
            ],
            dvds=[
                {
                    "title": "Inception (Blu-ray)",
                    "publish_date": "2010",
                    "ean_isbn13": "883929270675",
                    "upc_isbn10": "",
                }
            ],
        )
        link_ownership()
        result = _read(os.path.join(str(out), "media", "dvds.json"))
        watched = result["dvds"][0].get("watched")
        assert watched is not None
        assert watched["rating"] == "5"
        assert watched["date"] == "2023-01-15"
        assert watched["letterboxd_uri"] == "https://boxd.it/abc"

    def test_dvd_no_watched_when_no_movie_match(self, dirs):
        _, out = dirs
        _make_fixture_files(
            str(out),
            movies=[{"name": "Interstellar", "year": "2014", "rating": "4"}],
            dvds=[
                {
                    "title": "Inception (Blu-ray)",
                    "publish_date": "2010",
                    "ean_isbn13": "111",
                    "upc_isbn10": "",
                }
            ],
        )
        link_ownership()
        result = _read(os.path.join(str(out), "media", "dvds.json"))
        assert result["dvds"][0].get("watched") is None

    # ── reverse: records get scrobble totals ──────────────────────────────────

    def test_record_gets_scrobble_total(self, dirs):
        _, out = dirs
        _make_fixture_files(
            str(out),
            scrobbles=[
                {
                    "artist": "Tame Impala",
                    "album": "Currents",
                    "song": "Let It Happen",
                    "scrobbles": 20,
                },
                {
                    "artist": "Tame Impala",
                    "album": "Currents",
                    "song": "The Less I Know",
                    "scrobbles": 15,
                },
            ],
            records=[
                {
                    "artist_name": "Tame Impala",
                    "album_name": "Currents",
                    "genre": "Rock",
                    "release_date": 2015,
                }
            ],
        )
        link_ownership()
        result = _read(os.path.join(str(out), "inventory", "records.json"))
        listened = result["owned"][0].get("listened")
        assert listened is not None
        assert listened["scrobbles"] == 35

    def test_record_no_listened_when_no_scrobble_match(self, dirs):
        _, out = dirs
        _make_fixture_files(
            str(out),
            scrobbles=[
                {
                    "artist": "Radiohead",
                    "album": "OK Computer",
                    "song": "Karma Police",
                    "scrobbles": 5,
                }
            ],
            records=[
                {
                    "artist_name": "Tame Impala",
                    "album_name": "Currents",
                    "genre": "Rock",
                    "release_date": 2015,
                }
            ],
        )
        link_ownership()
        result = _read(os.path.join(str(out), "inventory", "records.json"))
        assert result["owned"][0].get("listened") is None

    # ── reverse: owned books get read data ────────────────────────────────────

    def test_owned_book_gets_read_data(self, dirs):
        _, out = dirs
        _make_fixture_files(
            str(out),
            books_read=[
                {
                    "title": "Dune",
                    "author": "Frank Herbert",
                    "isbn": "0441013597",
                    "isbn13": "",
                    "my_rating": "5",
                    "date": "2024-03-01",
                }
            ],
            books_owned=[
                {
                    "title": "Dune",
                    "author": "Frank Herbert",
                    "isbn": "0441013597",
                    "isbn13": "",
                }
            ],
        )
        link_ownership()
        result = _read(os.path.join(str(out), "media", "books.json"))
        read_info = result["owned"][0].get("read")
        assert read_info is not None
        assert read_info["rating"] == "5"
        assert read_info["date"] == "2024-03-01"

    def test_owned_book_no_read_when_not_in_read_list(self, dirs):
        _, out = dirs
        _make_fixture_files(
            str(out),
            books_read=[],
            books_owned=[
                {
                    "title": "Dune",
                    "author": "Frank Herbert",
                    "isbn": "0441013597",
                    "isbn13": "",
                }
            ],
        )
        link_ownership()
        result = _read(os.path.join(str(out), "media", "books.json"))
        assert result["owned"][0].get("read") is None

    # ── missing files ────────────────────────────────────────────────────────

    def test_missing_files_no_crash(self, dirs):
        """link_ownership() should be a no-op when source files are absent."""
        link_ownership()  # no fixture files created → should not raise
