"""Tests for the pure helper functions in etl.intake and etl.transforms."""

from __future__ import annotations

from datetime import date

import pytest
from openpyxl import Workbook

from lib.etl import config, intake, transforms

# ---------------------------------------------------------------------------
# intake.get_source_file_date
# ---------------------------------------------------------------------------


class TestGetSourceFileDate:
    def test_csv(self):
        assert intake.get_source_file_date("goodreads-2025-05-27.csv") == date(
            2025, 5, 27
        )

    def test_xml(self):
        assert intake.get_source_file_date("mal-2023-08-31.xml") == date(2023, 8, 31)

    def test_ics(self):
        assert intake.get_source_file_date("calendar-2024-07-09.ics") == date(
            2024, 7, 9
        )

    def test_multi_dash_source(self):
        # source names with underscores in the file name portion are fine
        assert intake.get_source_file_date("letterboxd_ratings-2026-03-25.csv") == date(
            2026, 3, 25
        )

    def test_directory_no_extension(self):
        # dated export directories (e.g. trakt-2026-05-30, apple_health-2026-05-29)
        assert intake.get_source_file_date("trakt-2026-05-30") == date(2026, 5, 30)
        assert intake.get_source_file_date("apple_health-2026-05-29") == date(
            2026, 5, 29
        )


# ---------------------------------------------------------------------------
# intake.get_latest_data_file
# ---------------------------------------------------------------------------


class TestGetLatestDataFile:
    def test_picks_latest(self):
        files = [
            "goodreads-2023-08-12.csv",
            "goodreads-2025-05-27.csv",
            "goodreads-2024-08-02.csv",
        ]
        assert intake.get_latest_data_file(files) == "goodreads-2025-05-27.csv"

    def test_single_file(self):
        assert (
            intake.get_latest_data_file(["records-2024-08-31.csv"])
            == "records-2024-08-31.csv"
        )

    def test_raises_on_empty(self):
        with pytest.raises(ValueError):
            intake.get_latest_data_file([])


# ---------------------------------------------------------------------------
# transforms.convert_to_snake_case
# ---------------------------------------------------------------------------


class TestConvertToSnakeCase:
    def test_spaces(self):
        assert transforms.convert_to_snake_case("Date Read") == "date_read"

    def test_hyphens(self):
        assert transforms.convert_to_snake_case("first-name") == "first_name"

    def test_already_lower(self):
        assert transforms.convert_to_snake_case("title") == "title"

    def test_mixed_case(self):
        assert transforms.convert_to_snake_case("My Status") == "my_status"


# ---------------------------------------------------------------------------
# transforms.drop_fields
# ---------------------------------------------------------------------------


class TestDropFields:
    def test_removes_present_keys(self):
        data = [{"a": 1, "b": 2, "c": 3}]
        result = transforms.drop_fields(data, ("a", "c"))
        assert result == [{"b": 2}]

    def test_missing_keys_are_noop(self):
        data = [{"x": 1}]
        result = transforms.drop_fields(data, ("y", "z"))
        assert result == [{"x": 1}]

    def test_multiple_rows(self):
        data = [{"a": 1, "b": 2}, {"a": 3, "b": 4}]
        result = transforms.drop_fields(data, ("a",))
        assert result == [{"b": 2}, {"b": 4}]


# ---------------------------------------------------------------------------
# transforms.map_fields
# ---------------------------------------------------------------------------


class TestMapFields:
    def test_renames_keys(self):
        data = [{"old": "val"}]
        result = transforms.map_fields(data, {"old": "new"})
        assert result == [{"new": "val"}]

    def test_absent_key_is_noop(self):
        data = [{"x": 1}]
        result = transforms.map_fields(data, {"y": "z"})
        assert result == [{"x": 1}]

    def test_multiple_renames(self):
        data = [{"a": 1, "b": 2}]
        result = transforms.map_fields(data, {"a": "alpha", "b": "beta"})
        assert result == [{"alpha": 1, "beta": 2}]


# ---------------------------------------------------------------------------
# transforms.group_by
# ---------------------------------------------------------------------------


class TestGroupBy:
    def test_groups(self):
        data = [
            {"status": "read", "title": "Dune"},
            {"status": "reading", "title": "Foundation"},
            {"status": "read", "title": "Ender's Game"},
        ]
        grouped = transforms.group_by(data, "status")
        assert len(grouped["read"]) == 2
        assert len(grouped["reading"]) == 1

    def test_single_group(self):
        data = [{"k": "a", "v": 1}, {"k": "a", "v": 2}]
        grouped = transforms.group_by(data, "k")
        assert grouped == {"a": [{"k": "a", "v": 1}, {"k": "a", "v": 2}]}


# ---------------------------------------------------------------------------
# transforms.filter_key_by_list
# ---------------------------------------------------------------------------


class TestFilterKeyByList:
    def test_removes_matching(self):
        data = [{"title": "Keep"}, {"title": "Remove"}]
        result = transforms.filter_key_by_list(data, "title", ("Remove",))
        assert result == [{"title": "Keep"}]

    def test_no_match_keeps_all(self):
        data = [{"title": "A"}, {"title": "B"}]
        result = transforms.filter_key_by_list(data, "title", ("C",))
        assert len(result) == 2

    def test_empty_filter_list(self):
        data = [{"x": 1}]
        result = transforms.filter_key_by_list(data, "x", ())
        assert result == [{"x": 1}]


# ---------------------------------------------------------------------------
# transforms.left_join_by
# ---------------------------------------------------------------------------


class TestLeftJoinBy:
    def test_join_merges_matching(self):
        left = [{"name": "Dune", "year": "1984", "rating": "5"}]
        right = [{"name": "Dune", "year": "1984", "review": "Great"}]
        result = transforms.left_join_by(left, right, ["name", "year"])
        assert result == [
            {"name": "Dune", "year": "1984", "rating": "5", "review": "Great"}
        ]

    def test_no_match_passes_left_through(self):
        left = [{"name": "Dune", "year": "1984"}]
        right = [{"name": "Foundation", "year": "1951"}]
        result = transforms.left_join_by(left, right, ["name", "year"])
        assert result == [{"name": "Dune", "year": "1984"}]

    def test_empty_right(self):
        left = [{"name": "X"}]
        result = transforms.left_join_by(left, [], ["name"])
        assert result == left


# ---------------------------------------------------------------------------
# transforms.excel_to_dict
# ---------------------------------------------------------------------------


class TestExcelToDict:
    def _make_sheet(self, headers: list[str], rows: list[list]):
        """Return an openpyxl worksheet with the given headers and data rows."""
        wb = Workbook()
        ws = wb.active
        ws.append(headers)
        for row in rows:
            ws.append(row)
        return ws

    def test_headers_snake_cased(self):
        ws = self._make_sheet(
            ["Album Name", "Artist Name"], [["OK Computer", "Radiohead"]]
        )
        result = transforms.excel_to_dict(ws)
        assert result[0] == {"album_name": "OK Computer", "artist_name": "Radiohead"}

    def test_multiple_rows(self):
        ws = self._make_sheet(["Title", "Year"], [["Dune", 1965], ["Foundation", 1951]])
        result = transforms.excel_to_dict(ws)
        assert len(result) == 2
        assert result[1]["title"] == "Foundation"

    def test_empty_rows(self):
        ws = self._make_sheet(["Col A"], [])
        result = transforms.excel_to_dict(ws)
        assert result == []


# ---------------------------------------------------------------------------
# transforms.get_date_from_datetime
# ---------------------------------------------------------------------------


class TestGetDateFromDatetime:
    def test_basic(self):
        assert transforms.get_date_from_datetime("2024-08-31 12:00:00") == "2024-08-31"

    def test_start_of_day(self):
        assert transforms.get_date_from_datetime("2023-01-15 00:00:00") == "2023-01-15"

    def test_end_of_day(self):
        assert transforms.get_date_from_datetime("2023-01-15 23:59:59") == "2023-01-15"

    def test_hhmm_format(self):
        assert transforms.get_date_from_datetime("2024-03-10 09:30") == "2024-03-10"

    def test_invalid_raises(self):
        with pytest.raises(ValueError):
            transforms.get_date_from_datetime("not-a-date")


# ---------------------------------------------------------------------------
# transforms.upsert_data
# ---------------------------------------------------------------------------


class TestUpsertData:
    def test_new_pk_appended(self):
        old = [{"date": "2024-01-01", "steps": 5000}]
        new = [{"date": "2024-01-02", "steps": 7000}]
        result = transforms.upsert_data(old, new, pk="date")
        assert len(result) == 2
        assert {r["date"] for r in result} == {"2024-01-01", "2024-01-02"}

    def test_existing_pk_not_duplicated(self):
        old = [{"date": "2024-01-01", "steps": 5000}]
        new = [{"date": "2024-01-01", "steps": 9999}]
        result = transforms.upsert_data(old, new, pk="date")
        assert len(result) == 1
        assert result[0]["steps"] == 5000  # old value retained

    def test_empty_old_appends_all(self):
        new = [
            {"date": "2024-01-01", "steps": 100},
            {"date": "2024-01-02", "steps": 200},
        ]
        result = transforms.upsert_data([], new, pk="date")
        assert len(result) == 2

    def test_mixed_new_and_existing(self):
        old = [{"id": "a"}, {"id": "b"}]
        new = [{"id": "b"}, {"id": "c"}]
        result = transforms.upsert_data(old, new, pk="id")
        assert len(result) == 3
        assert {r["id"] for r in result} == {"a", "b", "c"}


# ---------------------------------------------------------------------------
# transforms.merge_records
# ---------------------------------------------------------------------------


class TestMergeRecords:
    def test_backfills_empty_string_field(self):
        old = [{"id": "a", "genre": ""}]
        new = [{"id": "a", "genre": "Rock"}]
        result = transforms.merge_records(old, new, pk="id")
        assert result[0]["genre"] == "Rock"

    def test_does_not_overwrite_nonempty_field(self):
        old = [{"id": "a", "genre": "Rock"}]
        new = [{"id": "a", "genre": "Pop"}]
        result = transforms.merge_records(old, new, pk="id")
        assert result[0]["genre"] == "Rock"

    def test_backfills_none_field(self):
        old = [{"id": "a", "cover": None}]
        new = [{"id": "a", "cover": "url.jpg"}]
        result = transforms.merge_records(old, new, pk="id")
        assert result[0]["cover"] == "url.jpg"

    def test_backfills_absent_field(self):
        old = [{"id": "a"}]
        new = [{"id": "a", "genre": "Rock"}]
        result = transforms.merge_records(old, new, pk="id")
        assert result[0]["genre"] == "Rock"

    def test_appends_unmatched_new_records(self):
        old = [{"id": "a"}]
        new = [{"id": "b"}]
        result = transforms.merge_records(old, new, pk="id")
        assert len(result) == 2
        assert {r["id"] for r in result} == {"a", "b"}

    def test_fill_only_false_overwrites(self):
        old = [{"id": "a", "name": "Old"}]
        new = [{"id": "a", "name": "New"}]
        result = transforms.merge_records(old, new, pk="id", fill_only=False)
        assert result[0]["name"] == "New"

    def test_preserves_old_order_appends_new(self):
        old = [{"id": "b"}, {"id": "a"}]
        new = [{"id": "a"}, {"id": "c"}]
        result = transforms.merge_records(old, new, pk="id")
        assert [r["id"] for r in result] == ["b", "a", "c"]

    def test_empty_old_appends_all_new(self):
        new = [{"id": "x"}, {"id": "y"}]
        result = transforms.merge_records([], new, pk="id")
        assert len(result) == 2


# ---------------------------------------------------------------------------
# intake.list_dated_exports
# ---------------------------------------------------------------------------


class TestListDatedExports:
    def test_excludes_cache_files(self, tmp_path, monkeypatch):
        monkeypatch.setattr(config, "INPUT_DATA_DIR", str(tmp_path))
        (tmp_path / "untappd-2026-06-02.csv").write_text("a,b")
        (tmp_path / "untappd-cache.json").write_text("{}")
        result = intake.list_dated_exports("untappd")
        assert result == ["untappd-2026-06-02.csv"]

    def test_returns_empty_when_no_exports(self, tmp_path, monkeypatch):
        monkeypatch.setattr(config, "INPUT_DATA_DIR", str(tmp_path))
        result = intake.list_dated_exports("untappd")
        assert result == []

    def test_only_matching_extension(self, tmp_path, monkeypatch):
        monkeypatch.setattr(config, "INPUT_DATA_DIR", str(tmp_path))
        (tmp_path / "untappd-2026-06-02.csv").write_text("a")
        (tmp_path / "untappd-2026-06-03.xml").write_text("x")
        result = intake.list_dated_exports("untappd", ".csv")
        assert result == ["untappd-2026-06-02.csv"]

    def test_excludes_other_sources(self, tmp_path, monkeypatch):
        monkeypatch.setattr(config, "INPUT_DATA_DIR", str(tmp_path))
        (tmp_path / "untappd-2026-06-02.csv").write_text("a")
        (tmp_path / "goodreads-2026-06-02.csv").write_text("b")
        result = intake.list_dated_exports("untappd")
        assert result == ["untappd-2026-06-02.csv"]


# ---------------------------------------------------------------------------
# intake.latest_export_date
# ---------------------------------------------------------------------------


class TestLatestExportDate:
    def test_returns_latest_date(self, tmp_path, monkeypatch):
        monkeypatch.setattr(config, "INPUT_DATA_DIR", str(tmp_path))
        (tmp_path / "goodreads-2025-01-01.csv").write_text("a")
        (tmp_path / "goodreads-2026-06-02.csv").write_text("a")
        result = intake.latest_export_date("goodreads")
        assert result == date(2026, 6, 2)

    def test_returns_none_when_no_exports(self, tmp_path, monkeypatch):
        monkeypatch.setattr(config, "INPUT_DATA_DIR", str(tmp_path))
        assert intake.latest_export_date("goodreads") is None

    def test_cache_file_not_counted(self, tmp_path, monkeypatch):
        monkeypatch.setattr(config, "INPUT_DATA_DIR", str(tmp_path))
        (tmp_path / "untappd-cache.json").write_text("{}")
        assert intake.latest_export_date("untappd") is None


# ---------------------------------------------------------------------------
# intake.get_enrich_date / intake.set_enrich_date
# ---------------------------------------------------------------------------


class TestEnrichState:
    def test_returns_none_when_no_file(self, tmp_path, monkeypatch):
        monkeypatch.setattr(config, "INPUT_DATA_DIR", str(tmp_path))
        assert intake.get_enrich_date("books_api") is None

    def test_roundtrip(self, tmp_path, monkeypatch):
        monkeypatch.setattr(config, "INPUT_DATA_DIR", str(tmp_path))
        intake.set_enrich_date("books_api", date(2026, 6, 2))
        assert intake.get_enrich_date("books_api") == date(2026, 6, 2)

    def test_multiple_sources_independent(self, tmp_path, monkeypatch):
        monkeypatch.setattr(config, "INPUT_DATA_DIR", str(tmp_path))
        intake.set_enrich_date("books_api", date(2026, 1, 1))
        intake.set_enrich_date("movies_api", date(2026, 2, 1))
        assert intake.get_enrich_date("books_api") == date(2026, 1, 1)
        assert intake.get_enrich_date("movies_api") == date(2026, 2, 1)

    def test_overwrite_updates_value(self, tmp_path, monkeypatch):
        monkeypatch.setattr(config, "INPUT_DATA_DIR", str(tmp_path))
        intake.set_enrich_date("books_api", date(2026, 1, 1))
        intake.set_enrich_date("books_api", date(2026, 6, 7))
        assert intake.get_enrich_date("books_api") == date(2026, 6, 7)
