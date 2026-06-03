from __future__ import annotations

import html
import json
import logging
import os
import re
from datetime import datetime

import gspread
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from icalendar import Calendar

from .. import config, io, transforms

GSPREAD_SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"]
CALENDAR_SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"]

# Calendar API delta-sync cache — named distinctly from the *.ics input files
CALENDAR_API_CACHE_FILENAME = "calendar-api-cache.json"


# ---------------------------------------------------------------------------
# Google service-account credentials (shared by Sheets + Calendar)
# ---------------------------------------------------------------------------


def _google_credentials(scopes: list[str]):
    """Build read-only service-account credentials from GOOGLE_SERVICE_ACCOUNT_FILE.

    Raises:
        ValueError: if the env var is unset or the key file does not exist,
            matching the fetch_lastfm / fetch_trakt missing-env convention.
    """
    key_file = os.environ.get("GOOGLE_SERVICE_ACCOUNT_FILE")
    if not key_file:
        raise ValueError("Missing env var: GOOGLE_SERVICE_ACCOUNT_FILE")
    if not os.path.exists(key_file):
        raise ValueError(
            f"Google service account key not found: {key_file!r} "
            "(set GOOGLE_SERVICE_ACCOUNT_FILE in .env)"
        )
    return service_account.Credentials.from_service_account_file(key_file, scopes=scopes)


# ---------------------------------------------------------------------------
# Google Sheets — inventory sources (full load on every run)
# ---------------------------------------------------------------------------


def fetch_google_sheet_records(
    sheet_id_env: str, worksheet: str | None = None
) -> list[dict]:
    """Fetch all rows from a Google Sheet as a list of dicts (full load).

    Args:
        sheet_id_env: Name of the env var holding the spreadsheet ID.
        worksheet: Tab name to read; if None, reads the first sheet.

    Returns a list[dict] with string-typed cell values as displayed in the sheet
    (FORMATTED_VALUE rendering).  This matches what the CSV exports produce, so
    the existing transforms need no adjustment.

    Raises:
        ValueError: if ``sheet_id_env`` or GOOGLE_SERVICE_ACCOUNT_FILE are unset.
    """
    sheet_id = os.environ.get(sheet_id_env)
    if not sheet_id:
        raise ValueError(f"Missing env var: {sheet_id_env}")
    creds = _google_credentials(GSPREAD_SCOPES)
    client = gspread.authorize(creds)
    sh = client.open_by_key(sheet_id)
    ws = sh.worksheet(worksheet) if worksheet else sh.sheet1
    return ws.get_all_records()


# ---------------------------------------------------------------------------
# Inventory transforms (used by both CSV and Sheets paths)
# ---------------------------------------------------------------------------


def transform_records(rows: list[dict]) -> dict:
    dropped_data = transforms.drop_fields(
        rows,
        (
            "Date Received",
            "Lead Time",
            "Record Cost",
            "Shipping Cost",
            "Tax",
            "Total Cost",
            "Retailer Name",
            "Online/Physical",
            "Location",
        ),
    )
    mapped_data = transforms.map_fields(
        dropped_data,
        {
            "Album Name": "album_name",
            "Artist Name": "artist_name",
            "Year Released": "release_date",
            "Date Purchased": "date",
        },
    )
    for record in mapped_data:
        record["date"] = datetime.strftime(
            datetime.strptime(record.get("date"), "%m/%d/%Y"),
            "%Y-%m-%d",
        )
    return {"owned": mapped_data}


def transform_games(rows: list[dict]) -> dict:
    mapped_data = transforms.map_fields(
        rows, {k: transforms.convert_to_snake_case(k) for k in rows[0].keys()}
    )
    for game in mapped_data:
        game.pop("", None)
    return {"games": mapped_data}


def transform_fragrance(wb) -> dict:
    inventory = transforms.drop_fields(
        transforms.excel_to_dict(wb["Own"]), ["price", "notes"]
    )
    wishlist = transforms.drop_fields(
        transforms.excel_to_dict(wb["Wishlist"]), ["price", "notes"]
    )
    return {"own": inventory, "want": wishlist}


def transform_fragrance_rows(own_rows: list[dict], want_rows: list[dict]) -> dict:
    """Transform Sheets-sourced fragrance rows into the fragrance.json shape.

    Row-based sibling to transform_fragrance(wb) which reads an openpyxl workbook.
    Rows come from gspread.get_all_records() with the sheet's header names as keys.
    Snake-cases headers and drops ``price`` / ``notes`` (same as the XLSX transform).
    """
    def _clean(rows: list[dict]) -> list[dict]:
        if not rows:
            return rows
        mapped = transforms.map_fields(
            rows, {k: transforms.convert_to_snake_case(k) for k in rows[0].keys()}
        )
        return transforms.drop_fields(mapped, ["price", "notes"])

    return {"own": _clean(own_rows), "want": _clean(want_rows)}


def get_games_data_api() -> None:
    """Fetch Game Library from Google Sheets and write _data/games.json."""
    rows = fetch_google_sheet_records("GAMES_SHEET_ID")
    io.save_formatted_data("games", transform_games(rows))


def get_records_data_api() -> None:
    """Fetch Record Collection from Google Sheets and write _data/records.json."""
    rows = fetch_google_sheet_records("RECORDS_SHEET_ID")
    io.save_formatted_data("records", transform_records(rows))


def get_fragrance_data_api() -> None:
    """Fetch Fragrance Collection from Google Sheets and write _data/fragrance.json."""
    own_rows = fetch_google_sheet_records("FRAGRANCE_SHEET_ID", worksheet="Own")
    want_rows = fetch_google_sheet_records("FRAGRANCE_SHEET_ID", worksheet="Wishlist")
    io.save_formatted_data("fragrance", transform_fragrance_rows(own_rows, want_rows))


def transform_dvd(rows: list[dict]) -> dict:
    dropped_data = transforms.drop_fields(
        rows,
        [
            "item_type",
            "first_name",
            "last_name",
            "publisher",
            "group",
            "tags",
            "notes",
            "price",
            "length",
            "number_of_discs",
            "number_of_players",
            "esrb",
            "aspect_ratio",
            "age_group",
            "ensemble",
            "rating",
            "review",
            "review_date",
            "status",
            "began",
            "completed",
            "copies",
        ],
    )
    for movie in dropped_data:
        published_date = movie["publish_date"]
        if len(published_date.split("-")) == 3:
            movie["publish_date"] = published_date.split("-")[0]
    transforms.map_fields(dropped_data, {"added": "date"})
    return {"dvds": dropped_data}


def get_dvd_data_api() -> None:
    """Fetch DVD Collection from Google Sheets and write _data/media/dvds.json."""
    rows = fetch_google_sheet_records("DVD_SHEET_ID")
    io.save_formatted_data("dvds", transform_dvd(rows))


# ---------------------------------------------------------------------------
# Google Calendar — lifting workouts (delta load via syncToken)
# ---------------------------------------------------------------------------


def fetch_calendar_events(_source_name: str | None = None) -> list[dict]:
    """Fetch lifting calendar events from the Google Calendar API, incrementally.

    Uses ``syncToken`` for delta updates — only events created, modified, or
    deleted since the last run are fetched.  Falls back to a full sync when the
    token has expired (HTTP 410 Gone).

    Reads GOOGLE_SERVICE_ACCOUNT_FILE and LIFTING_CALENDAR_ID from env.
    Cache: INPUT_DATA_DIR/calendar-api-cache.json →
        ``{ "sync_token": str, "events": { event_id: event_dict, ... } }``

    Returns the full current list of non-deleted event dicts.

    Raises:
        ValueError: if LIFTING_CALENDAR_ID or GOOGLE_SERVICE_ACCOUNT_FILE are unset.
    """
    calendar_id = os.environ.get("LIFTING_CALENDAR_ID")
    if not calendar_id:
        raise ValueError("Missing env var: LIFTING_CALENDAR_ID")

    creds = _google_credentials(CALENDAR_SCOPES)
    service = build("calendar", "v3", credentials=creds)

    cache_path = os.path.join(config.INPUT_DATA_DIR, CALENDAR_API_CACHE_FILENAME)
    if os.path.exists(cache_path):
        with open(cache_path, encoding="utf-8") as f:
            cache = json.load(f)
        sync_token: str | None = cache.get("sync_token")
        events_map: dict[str, dict] = cache.get("events", {})
    else:
        sync_token = None
        events_map = {}

    def _paginate(token: str | None) -> str | None:
        """Pull one complete pass of the events list into events_map.

        Returns the nextSyncToken from the final page, or None if absent.
        """
        params: dict = {
            "calendarId": calendar_id,
            "singleEvents": True,
            "showDeleted": True,
            "maxResults": 2500,
        }
        if token:
            params["syncToken"] = token

        next_sync_token = None
        page_token = None
        upserted = deleted = 0
        while True:
            if page_token:
                params["pageToken"] = page_token
            result = service.events().list(**params).execute()
            for event in result.get("items", []):
                if event.get("status") == "cancelled":
                    events_map.pop(event["id"], None)
                    deleted += 1
                else:
                    events_map[event["id"]] = event
                    upserted += 1
            next_sync_token = result.get("nextSyncToken")
            page_token = result.get("nextPageToken")
            if not page_token:
                break
        logging.info(
            f"Calendar: {upserted} upserted, {deleted} deleted, "
            f"{len(events_map)} total in cache"
        )
        return next_sync_token

    try:
        new_sync_token = _paginate(sync_token)
    except HttpError as exc:
        if exc.resp.status == 410:
            logging.warning("Calendar: syncToken expired (410 Gone) — performing full sync")
            events_map.clear()
            new_sync_token = _paginate(None)
        else:
            raise

    with open(cache_path, "w", encoding="utf-8") as f:
        json.dump(
            {"sync_token": new_sync_token, "events": events_map},
            f,
            indent=4,
            ensure_ascii=False,
        )

    return list(events_map.values())


def _parse_lifting_workout(name: str, description: str | None, dt) -> dict | None:
    """Parse a single calendar event into a workout dict, or return None if not a match.

    Called by both transform_lifting (ICS path) and transform_lifting_events (API path).
    """
    if not (
        name
        and "workout" in name
        and any(k in name for k in ("push", "pull", "lift", "full"))
    ):
        return None
    if description is None:
        return None

    cleaned = html.unescape(str(description)).replace("<br>", "\n")
    cleaned = cleaned.replace("<span>", "").replace("</span>", "")
    exercises = cleaned.split("\n")
    data = []
    for i in range(len(exercises)):
        if "treadmill" in exercises[i]:
            break
        exercises[i] = exercises[i].strip()
        if exercises[i] == "" or "skipped" in exercises[i]:
            continue
        if ":" in exercises[i] and "(" not in exercises[i]:
            exercise, count_weight = exercises[i].split(": ")
        elif ":" in exercises[i] and "(" in exercises[i]:
            exercise_count = exercises[i].split(":")[0]
            exercise, count_weight = exercise_count.split(" (")
        else:
            exercise, count_weight = exercises[i].split(" (")
        if exercise == "curls":
            exercise = "dumbell bicep curls"
        count_weight = count_weight.replace(" @ ", ", ")
        if "," not in count_weight:
            count = count_weight.replace(")", "")
            weight = 0
        else:
            count, weight = count_weight.split(", ")[:2]
            weight = re.search(r"\d+(\.\d+)?", weight).group()
        if "x" in count:
            sets_count, reps = count.split("x")
            sets = [int(reps) for _ in range(int(sets_count))]
        else:
            sets = []
            for rep_range in count.replace("–", "-").split("-"):
                if "/" in rep_range:
                    left, right = rep_range.split("/")
                    sets.append({"left": int(left), "right": int(right)})
                else:
                    sets.append(int(rep_range))
        data.append(
            {"name": exercise.title(), "sets": sets, "weight": float(weight)}
        )

    if "push" in name:
        lift_type = "push"
    elif "pull" in name:
        lift_type = "pull"
    elif "full body a" in name:
        lift_type = "full body a"
    elif "full body b" in name:
        lift_type = "full body b"
    else:
        lift_type = "other"

    return {
        "type": lift_type,
        "exercises": data,
        "date": datetime.strftime(dt, "%Y-%m-%d"),
        "time": datetime.strftime(dt, "%H:%M"),
    }


def transform_lifting(raw_text: str) -> dict:
    gcal = Calendar.from_ical(raw_text)
    workouts = []
    for component in gcal.walk():
        name = component.get("summary") or ""
        description = component.get("description")
        dt_prop = component.get("dtstart")
        if not dt_prop:
            continue
        workout = _parse_lifting_workout(name, description, dt_prop.dt)
        if workout is not None:
            workouts.append(workout)
    return {"workouts": workouts}


def transform_lifting_events(events: list[dict]) -> dict:
    """Transform Google Calendar API event dicts into the lifting.json shape."""
    workouts = []
    for event in events:
        name = event.get("summary", "")
        description = event.get("description")
        start = event.get("start", {})
        dt_str = start.get("dateTime") or start.get("date")
        if not dt_str:
            continue
        try:
            dt = datetime.fromisoformat(dt_str)
        except ValueError:
            continue
        workout = _parse_lifting_workout(name, description, dt)
        if workout is not None:
            workouts.append(workout)
    return {"workouts": workouts}


def get_lifting_data_api() -> None:
    """Fetch lifting calendar events from Google Calendar (delta) and write _data/lifting.json."""
    events = fetch_calendar_events()
    io.save_formatted_data("lifting", transform_lifting_events(events))
