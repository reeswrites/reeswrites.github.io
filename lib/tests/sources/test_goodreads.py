from __future__ import annotations

import pytest

from lib.etl import config, sources
from lib.tests.sources.conftest import _FakeXMLResponse, write_csv, load_output


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


class TestParseGoodreadsDate:
    def test_standard_date(self):
        assert sources._parse_goodreads_date("Sat Mar 24 00:00:00 -0800 2026") == "2026/03/24"

    def test_single_digit_day_with_leading_space(self):
        assert sources._parse_goodreads_date("Thu Jan  1 00:00:00 -0700 2026") == "2026/01/01"

    def test_empty_string_returns_empty(self):
        assert sources._parse_goodreads_date("") == ""

    def test_invalid_string_returns_empty(self):
        assert sources._parse_goodreads_date("not a date") == ""
