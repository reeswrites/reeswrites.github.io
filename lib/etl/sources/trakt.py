from __future__ import annotations

import json
import logging
import os

import requests

from .. import config, intake, io

TRAKT_API_ROOT = "https://api.trakt.tv"
TRAKT_CACHE_FILENAME = "trakt-cache.json"


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


def transform_trakt_export(raw_shows: list[dict]) -> list[dict]:
    blocklist_raw = os.environ.get("TRAKT_SHOW_BLOCKLIST", "")
    blocklist = {t.strip() for t in blocklist_raw.split(",") if t.strip()}
    data = []
    for entry in raw_shows:
        show = entry["show"]
        if show["title"] in blocklist:
            continue
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
        all_dates = [
            ep["last_watched_at"]
            for season in entry["seasons"]
            for ep in season["episodes"]
        ]
        last_watched_at = max(all_dates) if all_dates else None
        show_entry = {"title": show["title"], "year": show["year"], "seasons": seasons}
        if last_watched_at:
            show_entry["last_watched_at"] = last_watched_at
        data.append(show_entry)
    return data


def get_trakt_data_api() -> None:
    """Fetch watched shows from the Trakt API and write _data/media/tv.json."""
    shows = fetch_trakt_watched_shows()
    io.save_formatted_data("media/tv", {"shows": transform_trakt_export(shows)})


def get_latest_trakt_data():
    latest = intake._latest_filename("trakt")
    path = os.path.join(config.INPUT_DATA_DIR, latest)

    if os.path.isdir(path):
        with open(os.path.join(path, "watched-shows.json")) as f:
            raw = json.load(f)
    else:
        with open(path) as f:
            raw = json.load(f)

    trakt_shows = transform_trakt_export(raw)

    # Load existing tv.json to carry forward MAL metadata and MAL-only shows.
    MAL_FIELDS = ("is_anime", "mal_score", "mal_status", "mal_watched_episodes",
                  "mal_total_episodes", "japanese_title")
    tv_path = os.path.join(config.OUTPUT_DATA_DIR, "media", "tv.json")
    mal_meta: dict[str, dict] = {}
    mal_only: list[dict] = []
    if os.path.exists(tv_path):
        with open(tv_path) as f:
            existing = json.load(f)
        for show in existing.get("shows", []):
            meta = {k: show[k] for k in MAL_FIELDS if k in show}
            if show.get("seasons"):
                if meta:
                    mal_meta[show["title"]] = meta
            else:
                mal_only.append(show)

    # Merge MAL metadata back onto Trakt shows and append MAL-only shows.
    trakt_titles = set()
    for show in trakt_shows:
        trakt_titles.add(show["title"])
        if show["title"] in mal_meta:
            show.update(mal_meta[show["title"]])

    merged = trakt_shows + [s for s in mal_only if s["title"] not in trakt_titles]
    io.save_formatted_data("media/tv", {"shows": merged})
