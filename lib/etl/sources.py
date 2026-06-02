# needs to be first line for type annotations
from __future__ import annotations

import csv
import html
import json
import logging
import os
import random
import re
import unicodedata
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta
from time import sleep
from typing import Any, Callable

import requests
import xmltodict
from icalendar import Calendar
from lxml import etree

from . import config, intake, io, transforms

# ---------------------------------------------------------------------------
# Field-mapping / filter constants
# ---------------------------------------------------------------------------

MAL_FIELD_MAPPING = {
    "series_animedb_id": "anime_id",
    "series_title": "japanese_title",
    "my_watched_episodes": "watched_episodes",
    "my_finish_date": "date",
}

MAL_DROP_FIELDS = (
    "series_animedb_id",
    "my_id",
    "my_comments",
    "my_times_watched",
    "my_rated",
    "my_storage",
    "my_storage_value",
    "my_rewatch_value",
    "my_priority",
    "my_tags",
    "my_rewatching",
    "my_rewatching_ep",
    "my_discuss",
    "my_sns",
    "update_on_import",
)

MAL_FILTER_LIST = (
    "",
    "",
    "",
    "",
    "",
    # How Not to Summon a Demon Lord
    "",
    "",
    # Do You Love Your Mom and Her Two-Hit Multi-Target Attacks?
    "",
    # Hensuki: Are you willing to Fall in Love with a Pervert, as long as she's a Cutie?
    "",
    # 
    "",
)

GOODREADS_DROP_FIELDS = (
    "Spoiler",
    "Private Notes",
    "Binding",
    "Read Count",
    "Owned Copies",
    "Bookshelves with positions",
    "Book Id",
    "Author l-f",
)

LETTERBOXD_REVIEWS_DROP_FIELDS = (
    "rewatch",
    "tags",
)

WORKOUT_FIELD_MAPPING = {
    "@workoutActivityType": "workoutType",
    "@duration": "duration",
    "@startDate": "startTime",
    "@endDate": "endTime",
    "ActiveEnergyBurned": "activeCalories",
    "BasalEnergyBurned": "basalCalories",
    "DistanceWalkingRunning": "distance",
}

WORKOUT_DROP_FIELDS = (
    "WorkoutRoute",
    "MetadataEntry",
    "WorkoutEvent",
    "@durationUnit",
    "@sourceName",
    "@sourceVersion",
    "@device",
    "@creationDate",
)


# ---------------------------------------------------------------------------
# Network helper (MAL only)
# ---------------------------------------------------------------------------


def get_english_anime_title(anime_id: str) -> str | None:
    """Fetch the English alternative title for an anime from the MyAnimeList API."""
    response = requests.get(
        url=f"https://api.myanimelist.net/v2/anime/{anime_id}?fields=alternative_titles",
        headers={"X-MAL-CLIENT-ID": os.environ.get("MAL_CLIENT_ID")},
    )
    data = response.json()
    english_title = data["alternative_titles"]["en"]
    return english_title if english_title != "" else None


# ---------------------------------------------------------------------------
# Pure source transforms
# ---------------------------------------------------------------------------


def transform_goodreads(rows: list[dict]) -> dict:
    dropped_data = transforms.drop_fields(rows, GOODREADS_DROP_FIELDS)
    mapped_data = transforms.map_fields(
        dropped_data,
        {k: transforms.convert_to_snake_case(k) for k in dropped_data[0].keys()},
    )
    mapped_data = transforms.map_fields(mapped_data, {"date_read": "date"})
    owned_books = []
    for book in mapped_data:
        book["exclusive_shelf"] = transforms.convert_to_snake_case(
            book["exclusive_shelf"]
        )
        if book["bookshelves"] != "" and "own" in book["bookshelves"]:
            owned_books.append(book)
        book["isbn"] = book["isbn"][1:].replace('"', "")
        book["isbn13"] = book["isbn13"][1:].replace('"', "")
        if "Whistling Vivaldi" in book["title"]:
            book["title"] = (
                "Whistling Vivaldi: How Stereotypes Affect Us and What We Can Do (Issues of Our Time)"
            )
    grouped_data = transforms.group_by(mapped_data, "exclusive_shelf")
    del grouped_data["to_read"]
    grouped_data["owned"] = owned_books
    return grouped_data


def transform_letterboxd(ratings_rows: list[dict], reviews_rows: list[dict]) -> dict:
    mapped_ratings = transforms.map_fields(
        ratings_rows,
        {k: transforms.convert_to_snake_case(k) for k in ratings_rows[0].keys()},
    )
    mapped_reviews = transforms.map_fields(
        reviews_rows,
        {k: transforms.convert_to_snake_case(k) for k in reviews_rows[0].keys()},
    )
    dropped_reviews = transforms.drop_fields(
        mapped_reviews, LETTERBOXD_REVIEWS_DROP_FIELDS
    )
    return {
        "watched": transforms.left_join_by(
            mapped_ratings, dropped_reviews, ["name", "year"]
        )
    }


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


def transform_swimming(rows: list[dict]) -> dict:
    STROKE_DECODER = {
        "BR": "Breastroke",
        "FR": "Freestyle",
        "BK": "Backstroke",
        "FL": "Butterfly",
        "IM": "Individual Medley",
    }
    dropped_data = transforms.drop_fields(
        rows, ("LSC", "TEAM", "POINTS", "TIME STANDARD")
    )
    mapped_data = transforms.map_fields(
        dropped_data,
        {
            "EVENT": "event",
            "SWIM TIME": "time",
            "AGE": "age",
            "MEET": "meet",
            "SWIM DATE": "date",
        },
    )
    for entry in mapped_data:
        distance, stroke, course = entry["event"].split(" ")
        entry["event"] = {
            "distance": int(distance),
            "unit": "Yard" if "Y" in course else "Meter",
            "stroke": STROKE_DECODER[stroke],
            "course": "Short" if "S" in course else "Long",
        }
    return {"times": mapped_data}


EXCLUDED_LASTFM_ARTISTS: frozenset[str] = frozenset(
    [
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
    ]
)

# Last.fm CSV export timestamp format: "DD Mon YYYY HH:MM"
_LASTFM_TS_FORMAT = "%d %b %Y %H:%M"

LASTFM_API_ROOT = "https://ws.audioscrobbler.com/2.0/"
# Cache for incremental API pulls — lives in INPUT_DATA_DIR (gitignored)
LASTFM_CACHE_FILENAME = "lastfm-cache.json"

TRAKT_API_ROOT = "https://api.trakt.tv"
TRAKT_CACHE_FILENAME = "trakt-cache.json"
LETTERBOXD_CACHE_FILENAME = "letterboxd-cache.json"
GOODREADS_CACHE_FILENAME = "goodreads-cache.json"
_GOODREADS_RSS_DATE_FORMAT = "%a %b %d %H:%M:%S %z %Y"


def transform_lastfm(rows: list[dict]) -> dict:
    grouped_scrobbles: dict = {}
    for scrobble in rows:
        artist = scrobble["artist"]
        if artist in EXCLUDED_LASTFM_ARTISTS:
            continue
        album = scrobble["album"]
        song = scrobble["song"]
        grouped_scrobbles.setdefault(artist, {}).setdefault(album, {})
        grouped_scrobbles[artist][album][song] = (
            grouped_scrobbles[artist][album].get(song, 0) + 1
        )
    scrobbles_by_song = [
        {"artist": artist, "album": album, "song": song, "scrobbles": count}
        for artist, albums in grouped_scrobbles.items()
        for album, songs in albums.items()
        for song, count in songs.items()
    ]
    return {"scrobbles": scrobbles_by_song}


def fetch_lastfm_scrobbles(_source_name: str | None = None) -> list[dict]:
    """Fetch scrobbles from the Last.fm API, incrementally.

    Reads LASTFM_API_KEY and LASTFM_USER from the environment (set in .env).
    Persists fetched rows to a local cache file (INPUT_DATA_DIR/lastfm-cache.json)
    so subsequent runs only pull scrobbles newer than the last stored timestamp.

    Returns the full merged list of row dicts keyed by ``artist``, ``album``,
    ``song``, ``scrobbled_at`` (in _LASTFM_TS_FORMAT), and ``uts`` (int).
    The ``uts`` key is used for deduplication/watermarking and is harmless to
    the downstream transforms, which only read the four named fields.

    Note: ``datetime.fromtimestamp`` renders in local time.  This is internally
    consistent for API-sourced rows.  Rows backfilled from the CSV export may
    use a different timezone; that is acceptable since the two sources are
    additive.  To align exactly, switch to ``datetime.utcfromtimestamp``.

    Raises:
        ValueError: if LASTFM_API_KEY or LASTFM_USER are not set.
    """
    api_key = os.environ.get("LASTFM_API_KEY")
    user = os.environ.get("LASTFM_USER")
    if not api_key or not user:
        missing = [
            k for k, v in (("LASTFM_API_KEY", api_key), ("LASTFM_USER", user)) if not v
        ]
        logging.error(f"Missing env var(s): {', '.join(missing)}")
        raise ValueError(f"Missing Last.fm env var(s): {', '.join(missing)}")

    cache_path = os.path.join(config.INPUT_DATA_DIR, LASTFM_CACHE_FILENAME)
    if os.path.exists(cache_path):
        with open(cache_path, encoding="utf-8") as f:
            cache = json.load(f)
        cached_rows: list[dict] = cache.get("scrobbles", [])
        last_uts: int | None = cache.get("last_uts")
    else:
        cached_rows = []
        last_uts = None

    # Build a set of already-seen UTS values for O(1) deduplication.
    seen_uts: set[int] = {row["uts"] for row in cached_rows if "uts" in row}

    new_rows: list[dict] = []
    page = 1
    while True:
        params: dict = {
            "method": "user.getRecentTracks",
            "user": user,
            "api_key": api_key,
            "format": "json",
            "limit": 200,
            "page": page,
        }
        if last_uts is not None:
            params["from"] = last_uts + 1

        response = requests.get(LASTFM_API_ROOT, params=params)
        response.raise_for_status()
        data = response.json()
        recent = data.get("recenttracks", {})

        tracks = recent.get("track", [])
        if isinstance(tracks, dict):
            # Single-track response is a plain dict, not a list.
            tracks = [tracks]

        if not tracks:
            break

        for track in tracks:
            # Skip the currently-playing entry (it has no date/uts yet).
            attrs = track.get("@attr", {})
            if attrs.get("nowplaying") == "true":
                continue
            date_info = track.get("date")
            if not date_info:
                continue

            uts = int(date_info["uts"])
            if uts in seen_uts:
                continue

            scrobbled_at = datetime.fromtimestamp(uts).strftime(_LASTFM_TS_FORMAT)
            new_rows.append(
                {
                    "artist": track.get("artist", {}).get("#text", ""),
                    "album": track.get("album", {}).get("#text", ""),
                    "song": track.get("name", ""),
                    "scrobbled_at": scrobbled_at,
                    "uts": uts,
                }
            )
            seen_uts.add(uts)

        total_pages = int(recent.get("@attr", {}).get("totalPages", 1))
        logging.info(f"Last.fm: page {page}/{total_pages} ({len(new_rows)} new so far)")
        if page >= total_pages:
            break
        page += 1
        wait_time = random.uniform(0.1, 0.5)
        sleep(wait_time)

    all_rows = cached_rows + new_rows
    if all_rows:
        new_last_uts = max(row["uts"] for row in all_rows if "uts" in row)
    else:
        new_last_uts = last_uts

    with open(cache_path, "w", encoding="utf-8") as f:
        json.dump(
            {"last_uts": new_last_uts, "scrobbles": all_rows},
            f,
            indent=4,
            ensure_ascii=False,
        )

    logging.info(f"Last.fm: {len(new_rows)} new, {len(all_rows)} total in cache")
    return all_rows


# ---------------------------------------------------------------------------
# Shared RSS helpers
# ---------------------------------------------------------------------------


def _strip_html(text: str) -> str:
    """Remove HTML tags and unescape entities from a string."""
    return re.sub(r"<[^>]+>", "", html.unescape(text or "")).strip()


def _parse_goodreads_date(s: str) -> str:
    """Parse a Goodreads RSS date like 'Sat Mar 24 00:00:00 -0800 2026' → 'YYYY/MM/DD'."""
    if not s:
        return ""
    try:
        cleaned = " ".join(s.split())  # normalise multiple spaces around single-digit day
        dt = datetime.strptime(cleaned, _GOODREADS_RSS_DATE_FORMAT)
        return dt.strftime("%Y/%m/%d")
    except (ValueError, TypeError):
        return ""


# ---------------------------------------------------------------------------
# Trakt TV — incremental API fetcher
# ---------------------------------------------------------------------------


def fetch_trakt_watched_shows(_source_name: str | None = None) -> list[dict]:
    """Fetch watched shows from the Trakt API, incrementally.

    Compares ``episodes.watched_at`` from ``GET /sync/last_activities`` against
    the locally-cached value; skips a full refresh when nothing has changed.

    Reads TRAKT_CLIENT_ID and TRAKT_ACCESS_TOKEN from the environment.
    Cache: INPUT_DATA_DIR/trakt-cache.json → ``{ "watched_at": <iso>, "shows": [...] }``

    Returns the full list of watched-show dicts in the Trakt export shape
    (same structure as a Trakt bulk ``watched-shows.json`` export).

    Raises:
        ValueError: if TRAKT_CLIENT_ID or TRAKT_ACCESS_TOKEN are not set.
    """
    client_id = os.environ.get("TRAKT_CLIENT_ID")
    access_token = os.environ.get("TRAKT_ACCESS_TOKEN")
    if not client_id or not access_token:
        missing = [
            k for k, v in (("TRAKT_CLIENT_ID", client_id), ("TRAKT_ACCESS_TOKEN", access_token)) if not v
        ]
        logging.error(f"Missing env var(s): {', '.join(missing)}")
        raise ValueError(f"Missing Trakt env var(s): {', '.join(missing)}")

    headers = {
        "Content-Type": "application/json",
        "trakt-api-version": "2",
        "trakt-api-key": client_id,
        "Authorization": f"Bearer {access_token}",
    }

    cache_path = os.path.join(config.INPUT_DATA_DIR, TRAKT_CACHE_FILENAME)
    if os.path.exists(cache_path):
        with open(cache_path, encoding="utf-8") as f:
            cache = json.load(f)
        cached_watched_at: str | None = cache.get("watched_at")
        cached_shows: list[dict] = cache.get("shows", [])
    else:
        cached_watched_at = None
        cached_shows = []

    # Cheap watermark: only refetch if something new was watched.
    resp = requests.get(f"{TRAKT_API_ROOT}/sync/last_activities", headers=headers)
    resp.raise_for_status()
    latest_watched_at: str | None = resp.json().get("episodes", {}).get("watched_at")

    if latest_watched_at and latest_watched_at == cached_watched_at:
        logging.info(f"Trakt: nothing new since {cached_watched_at}, returning cache")
        return cached_shows

    logging.info("Trakt: fetching full watched-shows list...")
    resp = requests.get(
        f"{TRAKT_API_ROOT}/sync/watched/shows",
        headers=headers,
        params={"extended": "full"},
    )
    resp.raise_for_status()
    shows: list[dict] = resp.json()

    with open(cache_path, "w", encoding="utf-8") as f:
        json.dump(
            {"watched_at": latest_watched_at, "shows": shows},
            f,
            indent=4,
            ensure_ascii=False,
        )

    logging.info(f"Trakt: fetched {len(shows)} shows, watched_at={latest_watched_at}")
    return shows


# ---------------------------------------------------------------------------
# Letterboxd movies — RSS diary top-up
# ---------------------------------------------------------------------------


def fetch_letterboxd_diary(_source_name: str | None = None) -> list[dict]:
    """Fetch diary entries from the Letterboxd RSS feed, incrementally.

    Maintains INPUT_DATA_DIR/letterboxd-cache.json: ``{ "watched": [...] }``
    with entries keyed by RSS ``<guid>``.  The Letterboxd RSS only carries
    ~50 recent entries, so run ``seed_letterboxd_cache_from_csv()`` once
    before switching to this fetcher to preserve older history.

    Reads LETTERBOXD_USER from the environment.

    Returns the full merged list of watched-entry dicts:
        ``{ date, name, year, letterboxd_uri, rating?, review?, _guid }``
    (``_guid`` is an internal dedup key; stripped before writing output JSON.)

    Raises:
        ValueError: if LETTERBOXD_USER is not set.
    """
    user = os.environ.get("LETTERBOXD_USER")
    if not user:
        logging.error("Missing env var: LETTERBOXD_USER")
        raise ValueError("Missing Letterboxd env var: LETTERBOXD_USER")

    cache_path = os.path.join(config.INPUT_DATA_DIR, LETTERBOXD_CACHE_FILENAME)
    if os.path.exists(cache_path):
        with open(cache_path, encoding="utf-8") as f:
            cache = json.load(f)
        cached_entries: list[dict] = cache.get("watched", [])
    else:
        cached_entries = []

    seen_guids: set[str] = {e["_guid"] for e in cached_entries if "_guid" in e}

    feed_url = f"https://letterboxd.com/{user}/rss/"
    resp = requests.get(feed_url, headers={"User-Agent": "personal-site-etl/1.0"})
    resp.raise_for_status()

    feed = xmltodict.parse(resp.text)
    items = feed.get("rss", {}).get("channel", {}).get("item", [])
    if isinstance(items, dict):  # xmltodict collapses a single element to a dict
        items = [items]

    new_entries: list[dict] = []
    for item in items:
        # Only diary/film log entries have a watchedDate; skip lists, watchlists etc.
        watched_date = item.get("letterboxd:watchedDate")
        if not watched_date:
            continue

        raw_guid = item.get("guid", "")
        guid = raw_guid["#text"] if isinstance(raw_guid, dict) else str(raw_guid)
        if not guid:
            guid = f"{item.get('letterboxd:filmTitle')}|{item.get('letterboxd:filmYear')}|{watched_date}"

        if guid in seen_guids:
            continue

        description = item.get("description", "") or ""
        review = _strip_html(description) if description else ""
        rating_raw = item.get("letterboxd:memberRating")

        entry: dict = {
            "date": watched_date,
            "name": item.get("letterboxd:filmTitle", ""),
            "year": item.get("letterboxd:filmYear", ""),
            "letterboxd_uri": item.get("link", ""),
            "_guid": guid,
        }
        if rating_raw:
            entry["rating"] = rating_raw
        if review:
            entry["review"] = review

        new_entries.append(entry)
        seen_guids.add(guid)

    all_entries = cached_entries + new_entries
    with open(cache_path, "w", encoding="utf-8") as f:
        json.dump({"watched": all_entries}, f, indent=4, ensure_ascii=False)

    logging.info(f"Letterboxd: {len(new_entries)} new, {len(all_entries)} total in cache")
    return all_entries


def seed_letterboxd_cache_from_csv() -> None:
    """One-time: seed the Letterboxd cache from the committed CSV exports.

    Loads the latest ``letterboxd_ratings-*.csv`` and ``letterboxd_reviews-*.csv``
    from INPUT_DATA_DIR, transforms them via ``transform_letterboxd()``, and
    writes the result into the cache file — merging with any entries already
    present.  Assigns synthetic ``_guid`` values (``name|year|date``) so
    subsequent RSS runs dedup correctly.

    Typical use — run once in a Python shell before the first RSS fetch::

        from lib.etl import config, sources
        sources.seed_letterboxd_cache_from_csv()
    """
    cache_path = os.path.join(config.INPUT_DATA_DIR, LETTERBOXD_CACHE_FILENAME)
    existing: list[dict] = []
    if os.path.exists(cache_path):
        with open(cache_path, encoding="utf-8") as f:
            existing = json.load(f).get("watched", [])

    ratings = intake.load_latest("letterboxd_ratings")
    reviews = intake.load_latest("letterboxd_reviews")
    if not ratings:
        logging.warning("No letterboxd_ratings CSV found; skipping seed.")
        return

    transformed = transform_letterboxd(ratings, reviews)["watched"]
    for entry in transformed:
        if "_guid" not in entry:
            entry["_guid"] = f"{entry.get('name')}|{entry.get('year')}|{entry.get('date')}"

    existing_guids = {e["_guid"] for e in existing if "_guid" in e}
    new_from_csv = [e for e in transformed if e.get("_guid") not in existing_guids]
    merged = existing + new_from_csv

    with open(cache_path, "w", encoding="utf-8") as f:
        json.dump({"watched": merged}, f, indent=4, ensure_ascii=False)
    logging.info(
        f"Letterboxd seed: {len(new_from_csv)} entries added from CSV, {len(merged)} total"
    )


# ---------------------------------------------------------------------------
# Goodreads books — paginated shelf RSS
# ---------------------------------------------------------------------------

_GOODREADS_SHELF_MAP: dict[str, str] = {
    "read": "read",
    "currently-reading": "currently_reading",
    "owned": "owned",
}


def _fetch_goodreads_shelf(user_id: str, shelf: str, per_page: int = 100) -> list[dict]:
    """Fetch all pages of one Goodreads shelf RSS feed and return mapped records."""
    base_url = f"https://www.goodreads.com/review/list_rss/{user_id}"
    records: list[dict] = []
    page = 1
    while True:
        resp = requests.get(
            base_url,
            params={"shelf": shelf, "per_page": per_page, "page": page},
            headers={"User-Agent": "personal-site-etl/1.0"},
        )
        resp.raise_for_status()
        feed = xmltodict.parse(resp.text)
        items = feed.get("rss", {}).get("channel", {}).get("item", [])
        if isinstance(items, dict):
            items = [items]

        for item in items:
            book_node = item.get("book") or {}
            record = {
                "title": _strip_html(item.get("title", "")),
                "author": _strip_html(item.get("author_name", "")),
                "additional_authors": "",
                "isbn": item.get("isbn", "") or "",
                "isbn13": item.get("isbn13", "") or "",
                "my_rating": str(item.get("user_rating", "0") or "0"),
                "average_rating": str(item.get("average_rating", "") or ""),
                "publisher": "",
                "number_of_pages": str(book_node.get("num_pages", "") or ""),
                "year_published": str(item.get("book_published", "") or ""),
                "original_publication_year": str(item.get("book_published", "") or ""),
                "date_read": _parse_goodreads_date(item.get("user_read_at", "") or ""),
                "date_added": _parse_goodreads_date(item.get("user_date_added", "") or ""),
                "bookshelves": _strip_html(item.get("user_shelves", "") or ""),
                "exclusive_shelf": transforms.convert_to_snake_case(shelf),
                "my_review": _strip_html(item.get("user_review", "") or ""),
            }
            records.append(record)

        logging.info(f"Goodreads {shelf}: page {page} — {len(items)} items")
        if len(items) < per_page:
            break
        page += 1
        sleep(random.uniform(0.5, 1.5))

    return records


def fetch_goodreads_shelves(_source_name: str | None = None) -> dict:
    """Fetch all configured Goodreads shelves via RSS.

    Reads GOODREADS_USER_ID from the environment.  No API key needed for
    public profiles.  Each call fetches the full shelf (not incremental),
    which is correct-by-construction for shelf membership changes.

    Returns a dict matching the _data/media/books.json shape::

        {
            "currently_reading": [...],
            "read": [...],
            "owned": [...],
            "partly_read": [],
        }

    Raises:
        ValueError: if GOODREADS_USER_ID is not set.
    """
    user_id = os.environ.get("GOODREADS_USER_ID")
    if not user_id:
        logging.error("Missing env var: GOODREADS_USER_ID")
        raise ValueError("Missing Goodreads env var: GOODREADS_USER_ID")

    result: dict[str, list] = {
        "currently_reading": [],
        "read": [],
        "owned": [],
        "partly_read": [],
    }
    for shelf, key in _GOODREADS_SHELF_MAP.items():
        try:
            result[key] = _fetch_goodreads_shelf(user_id, shelf)
            logging.info(f"Goodreads: {shelf!r} → {len(result[key])} books")
        except Exception as exc:
            logging.error(f"Goodreads: failed to fetch shelf {shelf!r}: {exc}")

    return result


def transform_lifting(raw_text: str) -> dict:
    gcal = Calendar.from_ical(raw_text)
    workouts = []
    for component in gcal.walk():
        name = component.get("summary")
        if not (
            name
            and "workout" in name
            and any(k in name for k in ("push", "pull", "lift", "full"))
        ):
            continue
        if component.get("description") is None:
            continue
        cleaned = html.unescape(component.get("description")).replace("<br>", "\n")
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
        workouts.append(
            {
                "type": lift_type,
                "exercises": data,
                "date": datetime.strftime(component.get("dtstart").dt, "%Y-%m-%d"),
                "time": datetime.strftime(component.get("dtstart").dt, "%H:%M"),
            }
        )
    return {"workouts": workouts}


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


def transform_fragrance(wb) -> dict:
    inventory = transforms.drop_fields(
        transforms.excel_to_dict(wb["Own"]), ["price", "notes"]
    )
    wishlist = transforms.drop_fields(
        transforms.excel_to_dict(wb["Wishlist"]), ["price", "notes"]
    )
    return {"own": inventory, "want": wishlist}


def transform_games(rows: list[dict]) -> dict:
    mapped_data = transforms.map_fields(
        rows, {k: transforms.convert_to_snake_case(k) for k in rows[0].keys()}
    )
    for game in mapped_data:
        game.pop("", None)
    return {"games": mapped_data}


def transform_trakt_export(raw_shows: list[dict]) -> list[dict]:
    data = []
    for entry in raw_shows:
        show = entry["show"]
        seasons = []
        for season in entry["seasons"]:
            watched = [
                {"number": ep["number"], "watched_date": ep["last_watched_at"]}
                for ep in season["episodes"]
            ]
            seasons.append(
                {
                    "season": season["number"],
                    "watched": watched,
                    "episodes": len(watched),
                }
            )
        data.append({"title": show["title"], "year": show["year"], "seasons": seasons})
    return data


# ---------------------------------------------------------------------------
# Complex / network orchestration functions
# ---------------------------------------------------------------------------


def get_latest_mal_data():
    """
    Get latest data from MyAnimeList as JSON.
    Find Latest File -> XML to JSON -> Field Mapping -> Item Filtering ->
        Field Dropping -> Grouping -> Save File
    """
    mal_files = intake.get_files_by_source("mal")
    latest_mal_file = intake.get_latest_data_file(mal_files)

    mal_data = xmltodict.parse(intake.get_data_from_file(latest_mal_file))
    mal_data = mal_data["myanimelist"]["anime"]

    mapped_mal_data = transforms.map_fields(mal_data, MAL_FIELD_MAPPING)
    filtered_mal_data = transforms.filter_key_by_list(
        mapped_mal_data, "japanese_title", MAL_FILTER_LIST
    )

    for show in filtered_mal_data:
        english_title = get_english_anime_title(show["anime_id"])
        if english_title is not None:
            logging.info(
                f"Found English title {english_title} for {show['japanese_title']}"
            )
            show["english_title"] = english_title
        else:
            logging.info(f"Could not find English title for {show['japanese_title']}")
            show["english_title"] = show["japanese_title"]
        wait_time = random.uniform(0, 2)
        logging.info(f"Waiting {wait_time} seconds to prevent API spamming.")
        sleep(wait_time)

    # TODO delta load
    dropped_mal_data = transforms.drop_fields(filtered_mal_data, MAL_DROP_FIELDS)
    for show in dropped_mal_data:
        show["my_status"] = transforms.convert_to_snake_case(show["my_status"])
    grouped_mal_data = transforms.group_by(dropped_mal_data, "my_status")
    io.save_formatted_data("anime", grouped_mal_data)


def get_latest_letterboxd_data():
    ratings = intake.load_latest_csv("letterboxd_ratings")
    reviews = intake.load_latest_csv("letterboxd_reviews")
    io.save_formatted_data("media/movies", transform_letterboxd(ratings, reviews))


def get_latest_apple_workouts_data():
    logging.info("Parsing Apple Health data...")

    apple_health_files = intake.get_files_by_source("apple_health")
    latest_apple_health_file = intake.get_latest_data_file(apple_health_files)

    daily_steps: dict = defaultdict(int)
    workout_list = []

    with open(os.path.join(config.INPUT_DATA_DIR, latest_apple_health_file)) as file:
        tree = etree.parse(file)

        for record in tree.getroot().xpath(
            "Record[@type='HKQuantityTypeIdentifierStepCount']"
        ):
            date_obj = (
                datetime.strptime(record.get("startDate"), "%Y-%m-%d %H:%M:%S %z")
                .date()
                .isoformat()
            )
            if "Apple Watch" in unicodedata.normalize("NFKD", record.get("sourceName")):
                daily_steps[date_obj] += int(record.get("value"))

        for record in tree.getroot().xpath("Workout"):
            workout = {}
            for child in record.xpath("WorkoutStatistics"):
                if child.get("type") == "HKQuantityTypeIdentifierHeartRate":
                    workout["averageHR"] = child.get("average")
                    workout["minimumHR"] = child.get("minimum")
                    workout["maximumHR"] = child.get("maximum")
                elif child.get("type"):
                    workout[
                        child.get("type").replace("HKQuantityTypeIdentifier", "")
                    ] = child.get("sum")

            workout["@workoutActivityType"] = (
                record.get("workoutActivityType")
                .replace("HKWorkoutActivityType", "")
                .lower()
            )
            workout["@startDate"] = datetime.strftime(
                datetime.strptime(record.get("startDate"), "%Y-%m-%d %H:%M:%S %z"),
                "%Y-%m-%d %H:%M:%S",
            )
            workout["@endDate"] = datetime.strftime(
                datetime.strptime(record.get("endDate"), "%Y-%m-%d %H:%M:%S %z"),
                "%Y-%m-%d %H:%M:%S",
            )
            mins, sec_dec = record.get("duration").split(".")
            workout["@duration"] = (
                f"{mins} minute(s) and {round(60 * float('.' + sec_dec))} second(s)"
            )
            workout_list.append(workout)

    step_counts = [{"date": k, "steps": v} for k, v in daily_steps.items()]
    dropped_data = transforms.drop_fields(workout_list, WORKOUT_DROP_FIELDS)
    mapped_fields = transforms.map_fields(dropped_data, WORKOUT_FIELD_MAPPING)

    io.save_formatted_data("workouts", {"workouts": mapped_fields})
    io.save_formatted_data("step_counts", {"daily_steps": step_counts})


def get_latest_trakt_data():
    latest = intake._latest_filename("trakt")
    path = os.path.join(config.INPUT_DATA_DIR, latest)

    if os.path.isdir(path):
        with open(os.path.join(path, "watched-shows.json")) as f:
            raw = json.load(f)
    else:
        with open(path) as f:
            raw = json.load(f)

    data = transform_trakt_export(raw)
    date = datetime.today().strftime("%Y-%m-%d")
    with open(os.path.join(config.OUTPUT_DATA_DIR, f"trakt-{date}.json"), "w") as f:
        f.write(json.dumps(data, indent=4))


def get_trakt_data_api() -> None:
    """Fetch watched shows from the Trakt API and write _data/media/tv.json."""
    shows = fetch_trakt_watched_shows()
    io.save_formatted_data("media/tv", {"shows": transform_trakt_export(shows)})


def get_letterboxd_data_api() -> None:
    """Fetch Letterboxd diary from RSS and write _data/media/movies.json."""
    entries = fetch_letterboxd_diary()
    # Strip the internal _guid dedup key before writing output JSON.
    watched = [{k: v for k, v in e.items() if k != "_guid"} for e in entries]
    data = {"watched": watched}
    io.save_formatted_data("media/movies", data)


def get_goodreads_data_api() -> None:
    """Fetch Goodreads shelves via RSS and write _data/media/books.json."""
    data = fetch_goodreads_shelves()
    io.save_formatted_data("media/books", data)


def get_latest_apple_health_data():
    export_dir = os.path.join(
        config.INPUT_DATA_DIR, intake._latest_filename("apple_health")
    )
    logging.info(f"Using Apple Health export: {export_dir}")

    # --- step counts ---
    daily_steps: dict[str, int] = defaultdict(int)
    with open(intake.find_in_dir(export_dir, "Step Count*.csv")) as f:
        reader = csv.DictReader(f)
        date_col = "Date/Time" if "Date/Time" in reader.fieldnames else "Date"
        steps_col = (
            "Step Count (count)"
            if "Step Count (count)" in reader.fieldnames
            else "Step Count (steps)"
        )
        for row in reader:
            daily_steps[transforms.get_date_from_datetime(row[date_col])] = int(
                row[steps_col]
            )

    new_steps = [{"date": d, "steps": s} for d, s in sorted(daily_steps.items())]
    steps_path = os.path.join(config.OUTPUT_DATA_DIR, "step_counts.json")
    with open(steps_path) as f:
        old_steps = json.load(f)["daily_steps"]
    upserted_steps = transforms.upsert_data(old_steps, new_steps, pk="date")
    with open(steps_path, "w") as f:
        f.write(json.dumps({"daily_steps": upserted_steps}, indent=4))

    # --- cardio workouts ---
    workouts = []
    with open(intake.find_in_dir(export_dir, "Workouts*.csv")) as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row["Workout Type"] == "Traditional Strength Training":
                continue
            workout = {
                "workoutType": row["Workout Type"],
                "duration": row["Duration"],
                "date": transforms.get_date_from_datetime(row["Start"]),
                "startTime": row["Start"],
                "endTime": row["End"],
                "activeCalories": str(round(float(row["Active Energy (kcal)"]), 2)),
                "basalCalories": str(round(float(row["Resting Energy (kcal)"]), 2)),
            }
            dist_col = "Distance (mi)" if "Distance (mi)" in row else None
            dist = (
                float(row["Distance (mi)"])
                if dist_col
                else float(row["Distance (km)"]) * 0.621371
            )
            if dist > 0:
                workout["distance"] = str(round(dist, 2))
            hr_col = (
                "Avg. Heart Rate (bpm)"
                if "Avg. Heart Rate (bpm)" in row
                else "Avg. Heart Rate (count/min)"
            )
            if row[hr_col]:
                workout["averageHR"] = str(round(float(row[hr_col]), 2))
            workouts.append(workout)

    new_workouts = sorted(workouts, key=lambda x: x["startTime"])
    cardio_path = os.path.join(config.OUTPUT_DATA_DIR, "cardio.json")
    with open(cardio_path) as f:
        old_workouts = json.load(f)["workouts"]
    upserted_workouts = transforms.upsert_data(
        old_workouts, new_workouts, pk="startTime"
    )
    with open(cardio_path, "w") as f:
        f.write(json.dumps({"workouts": upserted_workouts}, indent=4))


def generate_activity_feed() -> None:
    if not config.SITE_ROOT:
        logging.error("--site-root is required to generate activity feed")
        return

    entries = []
    site_data = os.path.join(config.SITE_ROOT, "_data")

    lifting_path = os.path.join(config.OUTPUT_DATA_DIR, "lifting.json")
    if os.path.exists(lifting_path):
        with open(lifting_path, encoding="utf8") as f:
            data = json.load(f)
        for w in data.get("workouts", []):
            entry = {"date": w["date"], "type": "lifting", "label": w["type"].title()}
            if w.get("time"):
                entry["time"] = w["time"]
            entries.append(entry)

    movies_media_path = os.path.join(config.OUTPUT_DATA_DIR, "media", "movies.json")
    if os.path.exists(movies_media_path):
        with open(movies_media_path, encoding="utf8") as f:
            data = json.load(f)
        movies = (
            data
            if isinstance(data, list)
            else data.get("watched", data.get("movies", []))
        )
        for m in movies:
            if not m.get("date"):
                continue
            entry = {"date": m["date"], "type": "movie", "label": m["name"]}
            if m.get("rating"):
                entry["detail"] = f"{m['rating']}/5"
            entries.append(entry)

    books_path = os.path.join(config.OUTPUT_DATA_DIR, "books.json")
    books_media_path = os.path.join(config.OUTPUT_DATA_DIR, "media", "books.json")
    _books_source = books_path if os.path.exists(books_path) else books_media_path
    if os.path.exists(_books_source):
        with open(_books_source, encoding="utf8") as f:
            data = json.load(f)
        for book in data.get("read", []):
            # support both transform_goodreads() ("date") and RSS format ("date_read")
            raw_date = book.get("date", book.get("date_read", ""))
            if not raw_date:
                continue
            entries.append(
                {
                    "date": raw_date.replace("/", "-"),
                    "type": "book",
                    "label": book["title"],
                    "detail": f"by {book['author']}",
                }
            )

    beers_path = os.path.join(site_data, "beers.json")
    if os.path.exists(beers_path):
        with open(beers_path, encoding="utf8") as f:
            beers = json.load(f)
        if isinstance(beers, list):
            for beer in beers:
                created_at = beer.get("created_at", "")
                if not created_at:
                    continue
                entry = {
                    "date": created_at[:10],
                    "time": created_at[11:16],
                    "type": "beer",
                    "label": beer["beer_name"],
                }
                if beer.get("rating_score"):
                    entry["detail"] = f"{beer['rating_score']}/5"
                entries.append(entry)

    cardio_path = os.path.join(site_data, "cardio.json")
    if os.path.exists(cardio_path):
        with open(cardio_path, encoding="utf8") as f:
            data = json.load(f)
        workouts = data if isinstance(data, list) else data.get("workouts", [])
        for w in workouts:
            start_time = w.get("startTime", "")
            if not start_time:
                continue
            duration_str = w.get("duration", "")
            mins = duration_str.split(" minute")[0] if "minute" in duration_str else ""
            entry = {
                "date": start_time[:10],
                "time": start_time[11:16],
                "type": "cardio",
                "label": w.get("workoutType", "workout").title(),
            }
            if mins:
                entry["detail"] = f"{mins} min"
            entries.append(entry)

    steps_path = os.path.join(site_data, "step_counts.json")
    if os.path.exists(steps_path):
        with open(steps_path, encoding="utf8") as f:
            data = json.load(f)
        steps = data if isinstance(data, list) else data.get("daily_steps", [])
        for s in steps:
            if not s.get("date") or not s.get("steps"):
                continue
            entries.append(
                {
                    "date": s["date"],
                    "type": "steps",
                    "label": f"{int(s['steps']):,} steps",
                }
            )

    tv_path = os.path.join(site_data, "media", "tv.json")
    if os.path.exists(tv_path):
        with open(tv_path, encoding="utf8") as f:
            data = json.load(f)
        shows = data if isinstance(data, list) else list(data.values())[0]
        show_day: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
        for show in shows:
            title = show["title"]
            for season in show.get("seasons", []):
                for episode in season.get("watched", []):
                    watched = episode.get("watched_date", episode.get("date", ""))
                    date = str(watched)[:10] if watched else ""
                    if date:
                        show_day[title][date] += 1
        for title, date_counts in show_day.items():
            for date, count in date_counts.items():
                entries.append(
                    {
                        "date": date,
                        "type": "tv",
                        "label": title,
                        "detail": f"{count} episode{'s' if count != 1 else ''}",
                    }
                )

    changelog_path = os.path.join(site_data, "changelog.json")
    if os.path.exists(changelog_path):
        with open(changelog_path, encoding="utf8") as f:
            data = json.load(f)
        for day in data.get("entries", []):
            if not day.get("date") or not day.get("entries"):
                continue
            entries.append(
                {"date": day["date"], "type": "changelog", "entries": day["entries"]}
            )

    entries.sort(key=lambda e: e["date"], reverse=True)

    out_path = os.path.join(config.SITE_ROOT, "static", "data", "activity.json")
    with open(out_path, "w", encoding="utf8") as f:
        f.write(
            json.dumps(
                {
                    "entries": entries,
                    "last_updated": datetime.today().strftime("%Y-%m-%d"),
                },
                indent=4,
                ensure_ascii=False,
            )
        )
    logging.info(f"Activity feed: {len(entries)} entries → {out_path}")


def _build_lastfm_insights(rows: list[dict]) -> None:
    """Core of the Last.fm insights builder — shared by CSV and API paths.

    Accepts rows with keys ``artist``, ``album``, ``song``, ``scrobbled_at``
    (timestamp string in _LASTFM_TS_FORMAT) and writes
    ``static/data/scrobbles.json`` under config.SITE_ROOT.

    Output schema:
        {
          "last_updated": "YYYY-MM-DD",
          "artists": [...],   # string pool
          "albums":  [...],
          "songs":   [...],
          "tracks":  [[artistIdx, albumIdx, songIdx], ...],
          "weeks":   ["YYYY-MM-DD", ...],  # sorted Monday dates
          "plays":   [[trackIdx, weekIdx, count], ...]
        }
    """
    # --- intern strings ---
    artist_idx: dict[str, int] = {}
    album_idx: dict[str, int] = {}
    song_idx: dict[str, int] = {}
    track_idx: dict[tuple[int, int, int], int] = {}
    bucket_idx: dict[str, int] = {}
    artists: list[str] = []
    albums: list[str] = []
    songs: list[str] = []
    tracks: list[list[int]] = []
    buckets: list[str] = []

    # plays_map[(trackIdx, bucketIdx)] = count
    plays_map: dict[tuple[int, int], int] = {}
    skipped = 0

    for row in rows:
        artist = row.get("artist", "").strip()
        if not artist or artist in EXCLUDED_LASTFM_ARTISTS:
            continue

        album = row.get("album", "").strip()
        song = row.get("song", "").strip()
        ts = row.get("scrobbled_at", "").strip()

        # parse timestamp → Monday date of that week ("YYYY-MM-DD")
        try:
            dt = datetime.strptime(ts, _LASTFM_TS_FORMAT)
            monday = dt - timedelta(days=dt.weekday())
            bucket = monday.strftime("%Y-%m-%d")
        except (ValueError, TypeError):
            skipped += 1
            continue

        # intern artist / album / song
        if artist not in artist_idx:
            artist_idx[artist] = len(artists)
            artists.append(artist)
        if album not in album_idx:
            album_idx[album] = len(albums)
            albums.append(album)
        if song not in song_idx:
            song_idx[song] = len(songs)
            songs.append(song)

        # intern track
        key = (artist_idx[artist], album_idx[album], song_idx[song])
        if key not in track_idx:
            track_idx[key] = len(tracks)
            tracks.append(list(key))

        # intern week bucket
        if bucket not in bucket_idx:
            bucket_idx[bucket] = len(buckets)
            buckets.append(bucket)

        plays_map[(track_idx[key], bucket_idx[bucket])] = (
            plays_map.get((track_idx[key], bucket_idx[bucket]), 0) + 1
        )

    if skipped:
        logging.warning(f"Skipped {skipped} rows with unparseable timestamps")

    # sort weeks chronologically and remap indices
    sorted_weeks = sorted(buckets)
    new_bucket_idx = {w: i for i, w in enumerate(sorted_weeks)}
    old_to_new = {old: new_bucket_idx[w] for w, old in bucket_idx.items()}

    plays = [[ti, old_to_new[bi], count] for (ti, bi), count in plays_map.items()]

    out_path = os.path.join(config.SITE_ROOT, "static", "data", "scrobbles.json")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(
            json.dumps(
                {
                    "last_updated": datetime.today().strftime("%Y-%m-%d"),
                    "artists": artists,
                    "albums": albums,
                    "songs": songs,
                    "tracks": tracks,
                    "weeks": sorted_weeks,
                    "plays": plays,
                },
                separators=(",", ":"),
                ensure_ascii=False,
            )
        )
    logging.info(
        f"Last.fm insights: {len(tracks)} tracks, {len(sorted_weeks)} weeks, "
        f"{len(plays)} play-buckets → {out_path}"
    )


def generate_lastfm_insights() -> None:
    """Build scrobbles.json from the most recent Last.fm CSV export (CSV path)."""
    try:
        rows = intake.load_latest_lastfm("lastfm")
    except (FileNotFoundError, ValueError):
        logging.warning("No lastfm CSV found in input dir — skipping lastfm insights")
        return
    _build_lastfm_insights(rows)


def generate_lastfm_insights_api() -> None:
    """Build scrobbles.json using the Last.fm API (incremental cache path)."""
    try:
        rows = fetch_lastfm_scrobbles()
    except ValueError:
        logging.warning(
            "Last.fm API credentials not set — skipping lastfm insights (API)"
        )
        return
    _build_lastfm_insights(rows)


# ---------------------------------------------------------------------------
# Source descriptor + driver
# ---------------------------------------------------------------------------


@dataclass
class Source:
    input_name: str
    loader: Callable[[str], Any]
    transform: Callable[..., dict]
    output_name: str


def run_source(source: Source) -> None:
    data = source.loader(source.input_name)
    io.save_formatted_data(source.output_name, source.transform(data))


# 8 simple sources — single file in, single JSON out
SOURCES: dict[str, Source] = {
    "books": Source("goodreads", intake.load_latest, transform_goodreads, "books"),
    "records": Source("records", intake.load_latest, transform_records, "records"),
    "swimming": Source(
        "swim_times", intake.load_latest, transform_swimming, "swimming"
    ),
    "dvd": Source("dvd", intake.load_latest, transform_dvd, "dvd"),
    "games": Source("games", intake.load_latest, transform_games, "games"),
    "lastfm": Source("lastfm", intake.load_latest_lastfm, transform_lastfm, "lastfm"),
    "lifting": Source("calendar", intake.load_latest, transform_lifting, "lifting"),
    "fragrance": Source(
        "fragrance", intake.load_latest, transform_fragrance, "fragrance"
    ),
    # API-backed Last.fm source (incremental, no CSV needed)
    "lastfm_api": Source("lastfm", fetch_lastfm_scrobbles, transform_lastfm, "lastfm"),
}

SOURCE_MAP: dict[str, Source | Callable] = {
    **SOURCES,
    # complex sources: multiple inputs, multiple outputs, or network-only
    "movies": get_latest_letterboxd_data,
    "workouts": get_latest_apple_workouts_data,
    "apple_health": get_latest_apple_health_data,
    "mal": get_latest_mal_data,
    "trakt": get_latest_trakt_data,
    "activity": generate_activity_feed,
    "lastfm_insights": generate_lastfm_insights,
    "lastfm_insights_api": generate_lastfm_insights_api,
    # API/RSS-backed incremental sources (no manual export needed)
    "trakt_api": get_trakt_data_api,
    "movies_api": get_letterboxd_data_api,
    "books_api": get_goodreads_data_api,
}

DEFAULT_SOURCES = ["books", "movies", "lifting", "games"]
