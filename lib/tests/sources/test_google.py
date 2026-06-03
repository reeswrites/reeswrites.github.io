from __future__ import annotations

import json

import pytest

from lib.etl import config, sources
from lib.tests.sources.conftest import write_csv, load_output


_PUSH_DESCRIPTION = (
    "Chest Press (3x10 @ 30lbs)\n"
    "Incline Fly (3x12 @ 20lbs)\n"
    "Tricep Pushdown: 3x15 @ 25lbs\n"
)


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


class _FakeCalendarResponse:
    def __init__(self, items: list[dict], next_sync_token: str = "tok-x", next_page_token: str | None = None):
        self._items = items
        self._next_sync_token = next_sync_token
        self._next_page_token = next_page_token
        self._params_received: dict = {}

    def execute(self) -> dict:
        result: dict = {"items": self._items}
        if self._next_page_token:
            result["nextPageToken"] = self._next_page_token
        else:
            result["nextSyncToken"] = self._next_sync_token
        return result


class _FakeCalendarService:
    def __init__(self, responses: list):
        self._responses = list(responses)
        self._calls: list[dict] = []

    def events(self):
        return self

    def list(self, **params) -> _FakeCalendarResponse:
        self._calls.append(params)
        return self._responses.pop(0)


# ---------------------------------------------------------------------------
# Inventory transforms
# ---------------------------------------------------------------------------


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


# ---------------------------------------------------------------------------
# Lifting transforms
# ---------------------------------------------------------------------------


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


# ---------------------------------------------------------------------------
# Calendar API fetch
# ---------------------------------------------------------------------------


class TestFetchCalendarEvents:
    @pytest.fixture()
    def cal_dirs(self, tmp_path, monkeypatch):
        monkeypatch.setattr(sources.config, "INPUT_DATA_DIR", str(tmp_path))
        monkeypatch.setenv("LIFTING_CALENDAR_ID", "primary")
        monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_FILE", str(tmp_path / "fake-key.json"))
        (tmp_path / "fake-key.json").write_text("{}")
        return tmp_path

    def _patch_creds(self, monkeypatch):
        monkeypatch.setattr(sources.google, "_google_credentials", lambda _scopes: None)

    def test_sync_token_stored_after_first_run(self, cal_dirs, monkeypatch):
        self._patch_creds(monkeypatch)
        svc = _FakeCalendarService([
            _FakeCalendarResponse(
                [_make_calendar_event("e1", "push workout", _PUSH_DESCRIPTION)],
                next_sync_token="tok-1",
            )
        ])
        monkeypatch.setattr(sources.google, "build", lambda *a, **kw: svc)

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
        monkeypatch.setattr(sources.google, "build", lambda *a, **kw: svc)

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
        monkeypatch.setattr(sources.google, "build", lambda *a, **kw: svc)

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

        monkeypatch.setattr(sources.google, "build", lambda *a, **kw: _Svc410())

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


# ---------------------------------------------------------------------------
# Sheets orchestrators
# ---------------------------------------------------------------------------


class TestSheetsOrchestrators:
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
        monkeypatch.setattr(sources.google, "fetch_google_sheet_records",
                            lambda *a, **kw: self._game_rows())
        sources.get_games_data_api()
        data = load_output(out, "games")
        assert "games" in data
        game = data["games"][0]
        assert game["name"] == "Wingspan"
        assert "" not in game

    def test_records_api_shape(self, dirs, monkeypatch):
        _, out = dirs
        monkeypatch.setattr(sources.google, "fetch_google_sheet_records",
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

        monkeypatch.setattr(sources.google, "fetch_google_sheet_records", _fake_fetch)
        sources.get_fragrance_data_api()
        data = load_output(out, "fragrance")
        assert data["own"][0]["name"] == "Bleu"
        assert data["want"][0]["name"] == "Aventus"
        for item in data["own"] + data["want"]:
            assert "price" not in item


# ---------------------------------------------------------------------------
# IO integration tests (run_source)
# ---------------------------------------------------------------------------


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
            "Album Name": "", "Artist Name": "", "Year Released": "",
            "Date Purchased": "1/1/2020", "Date Received": "", "Lead Time": "",
            "Record Cost": "", "Shipping Cost": "", "Tax": "", "Total Cost": "",
            "Retailer Name": "", "Online/Physical": "", "Location": "",
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
