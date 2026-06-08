from __future__ import annotations

import html
import json
import logging
import os
import random
import re
from datetime import datetime
from time import sleep

import gspread
import requests
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from .. import config, intake, io, transforms
from .letterboxd import (
    _TMDB_REQUIRED,
    TMDB_MOVIES_CACHE_FILENAME,
    _fetch_tmdb_movie_details,
    _search_tmdb_movie,
)

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
    return service_account.Credentials.from_service_account_file(
        key_file, scopes=scopes
    )


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
            "Sub-Genre",
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
            "Primary Genre": "genre",
            "Year Released": "release_date",
            "Date Purchased": "date_purchased",
        },
    )
    for record in mapped_data:
        raw = record.get("date_purchased")
        if raw:
            record["date_purchased"] = datetime.strftime(
                datetime.strptime(raw, "%m/%d/%Y"),
                "%Y-%m-%d",
            )
    return {"owned": mapped_data}


def transform_games(rows: list[dict]) -> dict:
    mapped_data = transforms.map_fields(
        rows, {k: transforms.convert_to_snake_case(k) for k in rows[0].keys()}
    )
    for game in mapped_data:
        game.pop("", None)
        if isinstance(game.get("mechanism"), str):
            game["mechanism"] = [m.strip() for m in game["mechanism"].splitlines() if m.strip()]
    return {"games": mapped_data}


def transform_fragrance_rows(own_rows: list[dict], want_rows: list[dict]) -> dict:
    """Transform Sheets-sourced fragrance rows into the fragrance.json shape."""

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


DISCOGS_API_ROOT = "https://api.discogs.com"
DISCOGS_RECORDS_CACHE_FILENAME = "discogs-records-cache.json"
LASTFM_ARTIST_CACHE_FILENAME = "lastfm-artist-cache.json"
_LASTFM_API_ROOT = "https://ws.audioscrobbler.com/2.0/"


def _discogs_search(artist: str, album: str, token: str, search_type: str) -> list:
    resp = requests.get(
        f"{DISCOGS_API_ROOT}/database/search",
        params={
            "type": search_type,
            "artist": artist,
            "release_title": album,
            "per_page": 1,
            "token": token,
        },
        headers={"User-Agent": "personal-site-etl/1.0", "Accept": "application/json"},
    )
    resp.raise_for_status()
    return resp.json().get("results", [])


def _fetch_discogs_album(artist: str, album: str, token: str) -> dict | None:
    """Search Discogs for a release and return {cover, label, tracklist} or None."""
    results = _discogs_search(artist, album, token, "master")
    if not results:
        results = _discogs_search(artist, album, token, "release")
    if not results:
        return None
    result = results[0]
    cover = result.get("cover_image") or None
    labels = result.get("label", [])
    label = labels[0] if labels else None
    tracklist = None
    resource_url = result.get("resource_url")
    if resource_url:
        try:
            detail = requests.get(
                resource_url,
                params={"token": token},
                headers={
                    "User-Agent": "personal-site-etl/1.0",
                    "Accept": "application/json",
                },
                timeout=10,
            ).json()
            tracks = detail.get("tracklist", [])
            tracklist = [
                {"position": t.get("position", ""), "title": t.get("title", "")}
                for t in tracks
                if t.get("type_") != "heading"
            ] or None
        except Exception as exc:
            logging.debug(f"Discogs: tracklist fetch failed: {exc}")
    return {"cover": cover, "label": label, "tracklist": tracklist}


def _fetch_lastfm_artist_bio(artist: str, api_key: str) -> str | None:
    resp = requests.get(
        _LASTFM_API_ROOT,
        params={
            "method": "artist.getInfo",
            "artist": artist,
            "api_key": api_key,
            "format": "json",
        },
        headers={"Accept": "application/json"},
        timeout=10,
    )
    resp.raise_for_status()
    bio = resp.json().get("artist", {}).get("bio", {}).get("summary", "") or ""
    bio = re.sub(r"<[^>]+>", "", bio).strip()
    return bio or None


def enrich_records_with_discogs_lastfm(records: list[dict]) -> list[dict]:
    """Enrich record dicts with Discogs (art, tracklist, label) and Last.fm artist bio.

    Skips gracefully when DISCOGS_TOKEN or LASTFM_API_KEY are unset.
    Caches results in INPUT_DATA_DIR so subsequent runs are incremental.
    """
    discogs_token = os.environ.get("DISCOGS_TOKEN")
    lastfm_key = os.environ.get("LASTFM_API_KEY")
    if not discogs_token and not lastfm_key:
        return records

    d_cache_path = os.path.join(config.INPUT_DATA_DIR, DISCOGS_RECORDS_CACHE_FILENAME)
    d_cache: dict = {}
    if discogs_token and os.path.exists(d_cache_path):
        with open(d_cache_path, encoding="utf-8") as f:
            d_cache = json.load(f)

    lf_cache_path = os.path.join(config.INPUT_DATA_DIR, LASTFM_ARTIST_CACHE_FILENAME)
    lf_cache: dict = {}
    if lastfm_key and os.path.exists(lf_cache_path):
        with open(lf_cache_path, encoding="utf-8") as f:
            lf_cache = json.load(f)

    d_newly = lf_newly = 0

    for record in records:
        artist = record.get("artist_name", "")
        album = record.get("album_name", "")
        key = f"{artist}|{album}"

        if discogs_token and key not in d_cache:
            try:
                d_cache[key] = _fetch_discogs_album(artist, album, discogs_token)
            except Exception as exc:
                logging.warning(f"Discogs: failed for {key!r}: {exc}")
                d_cache[key] = None
            d_newly += 1
            sleep(random.uniform(0.5, 1.0))

        if lastfm_key and artist not in lf_cache:
            try:
                lf_cache[artist] = _fetch_lastfm_artist_bio(artist, lastfm_key)
            except Exception as exc:
                logging.warning(f"Last.fm artist.getInfo failed for {artist!r}: {exc}")
                lf_cache[artist] = None
            lf_newly += 1
            sleep(random.uniform(0.1, 0.3))

    if d_newly:
        with open(d_cache_path, "w", encoding="utf-8") as f:
            json.dump(d_cache, f, indent=4, ensure_ascii=False)
        logging.info(f"Discogs: {d_newly} new entries, {len(d_cache)} total in cache")

    if lf_newly:
        with open(lf_cache_path, "w", encoding="utf-8") as f:
            json.dump(lf_cache, f, indent=4, ensure_ascii=False)
        logging.info(
            f"Last.fm artists: {lf_newly} new bios, {len(lf_cache)} total in cache"
        )

    enriched = []
    for record in records:
        artist = record.get("artist_name", "")
        album = record.get("album_name", "")
        merged = {**record}
        discogs = d_cache.get(f"{artist}|{album}") if discogs_token else None
        if discogs:
            if discogs.get("cover"):
                merged["cover"] = discogs["cover"]
            if discogs.get("label"):
                merged["label"] = discogs["label"]
            if discogs.get("tracklist"):
                merged["tracklist"] = discogs["tracklist"]
        bio = lf_cache.get(artist) if lastfm_key else None
        if bio:
            merged["artist_bio"] = bio
        enriched.append(merged)
    return enriched


def get_records_data_api() -> None:
    """Fetch Record Collection from Google Sheets and write _data/records.json."""
    rows = fetch_google_sheet_records("RECORDS_SHEET_ID")
    data = transform_records(rows)
    data["owned"] = enrich_records_with_discogs_lastfm(data["owned"])
    io.save_formatted_data("records", data)


def get_fragrance_data_api() -> None:
    """Fetch Fragrance Collection from Google Sheets and write _data/fragrance.json."""
    own_rows = fetch_google_sheet_records("FRAGRANCE_SHEET_ID", worksheet="Own")
    want_rows = fetch_google_sheet_records("FRAGRANCE_SHEET_ID", worksheet="Wishlist")
    io.save_formatted_data("fragrance", transform_fragrance_rows(own_rows, want_rows))


# ---------------------------------------------------------------------------
# DVD — TMDB enrichment
# ---------------------------------------------------------------------------

_DVD_FORMAT_RE = re.compile(
    r"[\[\(](?:4K\s*Ultra\s*HD|Blu[- ]?ray|Blu[- ]?Ray|DVD|UHD)[\]\)]",
    re.IGNORECASE,
)


def _clean_dvd_title(title: str) -> str:
    """Strip trailing format tags from a DVD title for TMDB search.

    Examples::
        "Inception (Blu-ray)"  -> "Inception"
        "300 [DVD]"            -> "300"
        "(500) Days of Summer [Blu-ray]" -> "(500) Days of Summer"
    """
    return _DVD_FORMAT_RE.sub("", title).strip()


def enrich_dvds_with_tmdb(
    dvds: list[dict], api_key: str, enrich: bool = False
) -> list[dict]:
    """Enrich DVD records with genres (and fill missing director) from TMDB.

    Shares *tmdb-movies-cache.json* with the Letterboxd movies pipeline so
    DVDs that match already-watched films incur zero extra API calls.

    Cache key: ``"{cleaned_title}|{publish_date}"`` — same format as the
    Letterboxd key ``"{name}|{year}"`` so the two sets of entries coexist
    safely in a single file.

    Fill-blank merge: ``genres`` list is added when absent; ``creators``
    (director) is filled only when blank in the Libib data; ``description``
    is filled from TMDB ``overview`` when blank.
    """
    cache_path = os.path.join(config.INPUT_DATA_DIR, TMDB_MOVIES_CACHE_FILENAME)
    cache: dict = {}
    if os.path.exists(cache_path):
        with open(cache_path, encoding="utf-8") as f:
            cache = json.load(f)

    newly_fetched = 0
    for dvd in dvds:
        cleaned = _clean_dvd_title(dvd.get("title", ""))
        year = dvd.get("publish_date", "")
        key = f"{cleaned}|{year}"

        if key in cache:
            if not enrich:
                continue
            cached = cache[key]
            if cached is None:
                continue
            if all(cached.get(f) for f in _TMDB_REQUIRED):
                continue

        tmdb_id = _search_tmdb_movie(cleaned, year, api_key)
        if tmdb_id:
            try:
                new_data = _fetch_tmdb_movie_details(tmdb_id, api_key)
                if key in cache and cache[key] is not None:
                    for k, v in new_data.items():
                        if cache[key].get(k) in (None, ""):
                            cache[key][k] = v
                else:
                    cache[key] = new_data
            except Exception as exc:
                logging.warning(f"TMDB: details failed for DVD {key!r}: {exc}")
                if key not in cache:
                    cache[key] = None
        else:
            cache[key] = None
        newly_fetched += 1
        sleep(random.uniform(0.05, 0.2))

    if newly_fetched:
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(cache, f, indent=4, ensure_ascii=False)
        logging.info(
            f"TMDB (DVDs): fetched {newly_fetched} new entries, "
            f"{len(cache)} total in cache"
        )

    enriched = []
    for dvd in dvds:
        cleaned = _clean_dvd_title(dvd.get("title", ""))
        year = dvd.get("publish_date", "")
        key = f"{cleaned}|{year}"
        cached = cache.get(key)
        if cached is None:
            enriched.append(dvd)
            continue
        merged = {**dvd}
        if cached.get("genres") and not merged.get("genres"):
            merged["genres"] = cached["genres"]
        if cached.get("director") and not merged.get("creators"):
            merged["creators"] = cached["director"]
        if cached.get("overview") and not merged.get("description"):
            merged["description"] = cached["overview"]
        enriched.append(merged)
    return enriched


def transform_dvd(rows: list[dict]) -> dict:
    dropped_data = transforms.drop_fields(
        rows,
        [
            "item_type",
            "first_name",
            "last_name",
            "collection",
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


def get_dvd_data() -> None:
    """Load latest Libib CSV export and write _data/media/dvds.json."""
    rows = intake.load_latest("dvd")
    data = transform_dvd(rows)
    api_key = os.environ.get("TMDB_API_KEY")
    if api_key:
        data["dvds"] = enrich_dvds_with_tmdb(data["dvds"], api_key)
    io.save_formatted_data("media/dvds", data)


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
            logging.warning(
                "Calendar: syncToken expired (410 Gone) — performing full sync"
            )
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
        data.append({"name": exercise.title(), "sets": sets, "weight": float(weight)})

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
