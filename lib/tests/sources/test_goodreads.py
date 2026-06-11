from __future__ import annotations

import pytest

from lib.etl import config, sources
from lib.tests.sources.conftest import _FakeXMLResponse, load_output, write_csv


def _make_goodreads_rss(items: list[dict]) -> str:
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
        "    <title>Goodreads: shelf</title>\n" + item_xml + "  </channel>\n</rss>"
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
        result = sources._fetch_goodreads_shelf("12345678", "read", per_page=100)

        assert call_count["n"] == 1
        assert len(result) == 1

    def test_date_format_converted(self, api_dirs, monkeypatch):
        item = _make_goodreads_item(read_at="Sat Mar 24 00:00:00 -0800 2026")
        xml = _make_goodreads_rss([item])
        monkeypatch.setattr("requests.get", lambda *a, **kw: _FakeXMLResponse(xml))

        result = sources.fetch_goodreads_shelves()
        assert result["read"][0]["date_read"] == "2026/03/24"

    def test_empty_read_at_yields_empty_date(self, api_dirs, monkeypatch):
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


class TestEnrichGoodreadsWithGoogleBooks:
    @pytest.fixture()
    def cache_dir(self, tmp_path, monkeypatch):
        monkeypatch.setattr(config, "INPUT_DATA_DIR", str(tmp_path))
        monkeypatch.setattr(sources.goodreads, "sleep", lambda *a: None)
        return tmp_path

    def _fake_gbooks_response(self):
        return {
            "items": [
                {
                    "volumeInfo": {
                        "categories": ["Fiction"],
                        "description": "A great book.",
                        "imageLinks": {"thumbnail": "http://cover.jpg"},
                    }
                }
            ]
        }

    def test_basic_enrichment(self, cache_dir, monkeypatch):
        from lib.tests.sources.conftest import _FakeResponse

        monkeypatch.setattr(
            "requests.get", lambda *a, **kw: _FakeResponse(self._fake_gbooks_response())
        )
        books = [{"isbn13": "9781234567890", "title": "Test", "author": "Author"}]
        result = sources.enrich_goodreads_with_google_books(books, "fake-key")
        assert result[0]["genres"] == ["Fiction"]
        assert result[0]["cover"] == "http://cover.jpg"

    def test_fill_blanks_does_not_overwrite_existing_genres(
        self, cache_dir, monkeypatch
    ):
        from lib.tests.sources.conftest import _FakeResponse

        monkeypatch.setattr(
            "requests.get", lambda *a, **kw: _FakeResponse(self._fake_gbooks_response())
        )
        books = [
            {
                "isbn13": "9781234567890",
                "title": "T",
                "author": "A",
                "genres": ["Existing"],
            }
        ]
        result = sources.enrich_goodreads_with_google_books(books, "fake-key")
        assert result[0]["genres"] == ["Existing"]

    def test_enrich_false_skips_cached_entry(self, cache_dir, monkeypatch):

        from lib.tests.sources.conftest import _FakeResponse

        call_count = {"n": 0}

        def fake_get(*a, **kw):
            call_count["n"] += 1
            return _FakeResponse(self._fake_gbooks_response())

        monkeypatch.setattr("requests.get", fake_get)
        books = [{"isbn13": "9781234567890", "title": "T", "author": "A"}]
        sources.enrich_goodreads_with_google_books(books, "fake-key")
        first_count = call_count["n"]
        sources.enrich_goodreads_with_google_books(books, "fake-key")
        assert call_count["n"] == first_count  # second call skipped (cache hit)

    def test_enrich_true_requeries_entry_missing_required_field(
        self, cache_dir, monkeypatch
    ):
        import json

        from lib.tests.sources.conftest import _FakeResponse

        # Seed cache with partial entry (no cover)
        cache_path = cache_dir / sources.GOOGLE_BOOKS_CACHE_FILENAME
        cache_path.write_text(
            json.dumps(
                {
                    "9781234567890": {
                        "genres": ["Fiction"],
                        "description": "desc",
                        "cover": None,
                    }
                }
            )
        )
        call_count = {"n": 0}

        def fake_get(*a, **kw):
            call_count["n"] += 1
            return _FakeResponse(self._fake_gbooks_response())

        monkeypatch.setattr("requests.get", fake_get)
        books = [{"isbn13": "9781234567890", "title": "T", "author": "A"}]
        sources.enrich_goodreads_with_google_books(books, "fake-key", enrich=True)
        assert call_count["n"] == 1  # re-queried despite cache hit

    def test_enrich_true_skips_entry_with_all_required_fields(
        self, cache_dir, monkeypatch
    ):
        import json

        from lib.tests.sources.conftest import _FakeResponse

        cache_path = cache_dir / sources.GOOGLE_BOOKS_CACHE_FILENAME
        cache_path.write_text(
            json.dumps(
                {
                    "9781234567890": {
                        "genres": ["Fiction"],
                        "description": "desc",
                        "cover": "http://cover.jpg",
                    }
                }
            )
        )
        call_count = {"n": 0}

        def fake_get(*a, **kw):
            call_count["n"] += 1
            return _FakeResponse(self._fake_gbooks_response())

        monkeypatch.setattr("requests.get", fake_get)
        books = [{"isbn13": "9781234567890", "title": "T", "author": "A"}]
        sources.enrich_goodreads_with_google_books(books, "fake-key", enrich=True)
        assert call_count["n"] == 0  # already complete, no re-query

    def test_two_arg_call_still_works(self, cache_dir, monkeypatch):
        from lib.tests.sources.conftest import _FakeResponse

        monkeypatch.setattr(
            "requests.get", lambda *a, **kw: _FakeResponse({"items": []})
        )
        books = [{"isbn13": "9781234567890", "title": "T", "author": "A"}]
        result = sources.enrich_goodreads_with_google_books(books)
        assert len(result) == 1


class TestEnrichBooksWithOpenLibrarySubjects:
    @pytest.fixture()
    def cache_dir(self, tmp_path, monkeypatch):
        monkeypatch.setattr(config, "INPUT_DATA_DIR", str(tmp_path))
        monkeypatch.setattr(sources.goodreads, "sleep", lambda *a: None)
        return tmp_path

    def _fake_ol_response(self, isbn: str, subjects: list[str]) -> dict:
        """Build a minimal /api/books jscmd=data response."""
        return {
            f"ISBN:{isbn}": {
                "subjects": [{"name": s} for s in subjects],
            }
        }

    def test_subjects_merged_into_genres(self, cache_dir, monkeypatch):
        from lib.tests.sources.conftest import _FakeResponse

        monkeypatch.setattr(
            "requests.get",
            lambda *a, **kw: _FakeResponse(
                self._fake_ol_response("9781234567890", ["Science Fiction", "Dystopia"])
            ),
        )
        books = [{"isbn13": "9781234567890", "title": "Book", "author": "Author"}]
        result = sources.enrich_books_with_openlibrary_subjects(books)
        assert "Science Fiction" in result[0]["genres"]
        assert "Dystopian" in result[0]["genres"]  # "Dystopia" → canonical "Dystopian"

    def test_subjects_merged_with_existing_google_genres(self, cache_dir, monkeypatch):
        from lib.tests.sources.conftest import _FakeResponse

        monkeypatch.setattr(
            "requests.get",
            lambda *a, **kw: _FakeResponse(
                self._fake_ol_response("9781234567890", ["Dystopia"])
            ),
        )
        books = [
            {
                "isbn13": "9781234567890",
                "title": "Book",
                "author": "Author",
                "genres": ["Fiction"],
            }
        ]
        result = sources.enrich_books_with_openlibrary_subjects(books)
        assert result[0]["genres"] == ["Fiction", "Dystopian"]

    def test_dedup_case_insensitive(self, cache_dir, monkeypatch):
        from lib.tests.sources.conftest import _FakeResponse

        monkeypatch.setattr(
            "requests.get",
            lambda *a, **kw: _FakeResponse(
                self._fake_ol_response("9781234567890", ["fiction"])
            ),
        )
        books = [
            {
                "isbn13": "9781234567890",
                "title": "Book",
                "author": "Author",
                "genres": ["Fiction"],
            }
        ]
        result = sources.enrich_books_with_openlibrary_subjects(books)
        # Both "Fiction" (Google) and "fiction" (OL) canonicalize to "Fiction" — only one copy
        assert result[0]["genres"].count("Fiction") == 1

    def test_flagged_subject_dropped(self, cache_dir, monkeypatch):
        from lib.tests.sources.conftest import _FakeResponse
        import lib.etl.sources._helpers as helpers

        monkeypatch.setattr(
            helpers,
            "predict_prob",
            lambda texts: [0.9 if "BAD" in t else 0.1 for t in texts],
        )
        monkeypatch.setattr(
            "requests.get",
            lambda *a, **kw: _FakeResponse(
                self._fake_ol_response("9781234567890", ["Fiction", "BAD subject"])
            ),
        )
        books = [{"isbn13": "9781234567890", "title": "Book", "author": "Author"}]
        result = sources.enrich_books_with_openlibrary_subjects(books)
        assert "BAD subject" not in result[0].get("genres", [])
        assert "Fiction" in result[0]["genres"]

    def test_cache_skips_previously_fetched(self, cache_dir, monkeypatch):
        from lib.tests.sources.conftest import _FakeResponse

        call_count = {"n": 0}

        def fake_get(*a, **kw):
            call_count["n"] += 1
            return _FakeResponse(
                self._fake_ol_response("9781234567890", ["Fiction"])
            )

        monkeypatch.setattr("requests.get", fake_get)
        books = [{"isbn13": "9781234567890", "title": "Book", "author": "Author"}]
        sources.enrich_books_with_openlibrary_subjects(books)
        first_count = call_count["n"]
        sources.enrich_books_with_openlibrary_subjects(books)
        assert call_count["n"] == first_count  # second call hits cache

    def test_book_without_isbn_skipped(self, cache_dir, monkeypatch):
        call_count = {"n": 0}

        def fake_get(*a, **kw):
            call_count["n"] += 1
            from lib.tests.sources.conftest import _FakeResponse
            return _FakeResponse({})

        monkeypatch.setattr("requests.get", fake_get)
        books = [{"title": "No ISBN Book", "author": "Author"}]
        result = sources.enrich_books_with_openlibrary_subjects(books)
        assert call_count["n"] == 0
        # no OL data; canonicalization still runs but produces empty genres
        assert result[0]["title"] == "No ISBN Book"
        assert result[0]["genres"] == []

    def test_batched_bibkeys_in_request_url(self, cache_dir, monkeypatch):
        from lib.tests.sources.conftest import _FakeResponse

        seen_params = {}

        def fake_get(url, params=None, **kw):
            seen_params.update(params or {})
            return _FakeResponse({})

        monkeypatch.setattr("requests.get", fake_get)
        books = [
            {"isbn13": "9781234567890", "title": "A", "author": "A"},
            {"isbn13": "9780987654321", "title": "B", "author": "B"},
        ]
        sources.enrich_books_with_openlibrary_subjects(books)
        bibkeys = seen_params.get("bibkeys", "")
        assert "ISBN:9781234567890" in bibkeys
        assert "ISBN:9780987654321" in bibkeys


class TestCanonicalizeGenres:
    def test_known_tag_maps_to_canonical(self):
        assert sources._canonicalize_genres(["Science Fiction"]) == ["Science Fiction"]

    def test_variant_maps_to_same_canonical(self):
        # OL "Dystopia" and "Dystopian" both → "Dystopian"
        result = sources._canonicalize_genres(["Dystopia", "Dystopian"])
        assert result == ["Dystopian"]

    def test_unknown_tag_dropped(self):
        assert sources._canonicalize_genres(["Reading Level-Grade 11"]) == []

    def test_case_insensitive_lookup(self):
        assert sources._canonicalize_genres(["science fiction"]) == ["Science Fiction"]
        assert sources._canonicalize_genres(["FICTION"]) == ["Fiction"]

    def test_order_preserved(self):
        result = sources._canonicalize_genres(["Fiction", "Fantasy", "Young Adult"])
        assert result == ["Fiction", "Fantasy", "Young Adult"]

    def test_empty_list(self):
        assert sources._canonicalize_genres([]) == []

    def test_google_books_categories_map_correctly(self):
        result = sources._canonicalize_genres(["Young Adult Fiction", "Fantasy & Magic"])
        assert "Young Adult" in result
        assert "Fantasy" in result


class TestDedupeGenres:
    def test_no_duplicates_unchanged(self):
        assert sources._dedup_genres(["Fiction", "Drama"]) == ["Fiction", "Drama"]

    def test_exact_duplicate_removed(self):
        assert sources._dedup_genres(["Fiction", "Fiction"]) == ["Fiction"]

    def test_case_insensitive_dedup(self):
        assert sources._dedup_genres(["Fiction", "fiction"]) == ["Fiction"]

    def test_order_preserved(self):
        assert sources._dedup_genres(["Zebra", "Apple", "Mango"]) == ["Zebra", "Apple", "Mango"]

    def test_empty_list(self):
        assert sources._dedup_genres([]) == []


class TestParseGoodreadsDate:
    def test_standard_date(self):
        assert (
            sources._parse_goodreads_date("Sat Mar 24 00:00:00 -0800 2026")
            == "2026/03/24"
        )

    def test_single_digit_day_with_leading_space(self):
        assert (
            sources._parse_goodreads_date("Thu Jan  1 00:00:00 -0700 2026")
            == "2026/01/01"
        )

    def test_empty_string_returns_empty(self):
        assert sources._parse_goodreads_date("") == ""

    def test_invalid_string_returns_empty(self):
        assert sources._parse_goodreads_date("not a date") == ""
