from __future__ import annotations

import json
import logging
import os
import random
from time import sleep

import requests
import xmltodict

from .. import config, intake, io, transforms
from ._helpers import _strip_html

LETTERBOXD_REVIEWS_DROP_FIELDS = (
    "rewatch",
    "tags",
)

LETTERBOXD_CACHE_FILENAME = "letterboxd-cache.json"
TMDB_API_ROOT = "https://api.themoviedb.org/3"
TMDB_MOVIES_CACHE_FILENAME = "tmdb-movies-cache.json"
_TMDB_OUTPUT_FIELDS = frozenset({"tmdb_id", "genres", "runtime", "imdb_id", "director"})


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


def _tmdb_get(path: str, api_key: str, params: dict | None = None) -> dict:
    resp = requests.get(
        f"{TMDB_API_ROOT}{path}",
        params={"api_key": api_key, **(params or {})},
        headers={"Accept": "application/json"},
    )
    resp.raise_for_status()
    return resp.json()


def _search_tmdb_movie(name: str, year: str, api_key: str) -> int | None:
    data = _tmdb_get(
        "/search/movie", api_key, {"query": name, "year": year, "include_adult": "false"}
    )
    results = data.get("results", [])
    return results[0]["id"] if results else None


def _fetch_tmdb_movie_details(tmdb_id: int, api_key: str) -> dict:
    data = _tmdb_get(f"/movie/{tmdb_id}", api_key, {"append_to_response": "credits"})
    directors = [
        c["name"] for c in data.get("credits", {}).get("crew", [])
        if c.get("job") == "Director"
    ]
    return {
        "tmdb_id": tmdb_id,
        "genres": [g["name"] for g in data.get("genres", [])],
        "runtime": data.get("runtime") or None,
        "imdb_id": data.get("imdb_id") or None,
        "director": directors[0] if directors else None,
    }


def enrich_letterboxd_with_tmdb(entries: list[dict], api_key: str) -> list[dict]:
    """Enrich Letterboxd watched entries with TMDB metadata using a local cache.

    Cache: INPUT_DATA_DIR/tmdb-movies-cache.json, keyed by "name|year".
    Entries already present in the cache (including None for not-found) are
    skipped on future runs.  Merges tmdb_id, genres, runtime, overview,
    poster_path, tmdb_score, and imdb_id onto each matched entry.
    """
    cache_path = os.path.join(config.INPUT_DATA_DIR, TMDB_MOVIES_CACHE_FILENAME)
    cache: dict = {}
    if os.path.exists(cache_path):
        with open(cache_path, encoding="utf-8") as f:
            cache = json.load(f)

    newly_fetched = 0
    for entry in entries:
        key = f"{entry['name']}|{entry.get('year', '')}"
        if key in cache:
            continue
        tmdb_id = _search_tmdb_movie(entry["name"], entry.get("year", ""), api_key)
        if tmdb_id:
            try:
                cache[key] = _fetch_tmdb_movie_details(tmdb_id, api_key)
            except Exception as exc:
                logging.warning(f"TMDB: details failed for {key!r} (id={tmdb_id}): {exc}")
                cache[key] = None
        else:
            cache[key] = None
        newly_fetched += 1
        sleep(random.uniform(0.05, 0.2))

    if newly_fetched:
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(cache, f, indent=4, ensure_ascii=False)
        logging.info(
            f"TMDB: fetched {newly_fetched} new movies, {len(cache)} total in cache"
        )

    return [
        {**e, **{k: v for k, v in cache[f"{e['name']}|{e.get('year', '')}"].items() if k in _TMDB_OUTPUT_FIELDS}}
        if cache.get(f"{e['name']}|{e.get('year', '')}") is not None
        else e
        for e in entries
    ]


def get_letterboxd_data_api() -> None:
    """Fetch Letterboxd diary from RSS and write _data/media/movies.json."""
    entries = fetch_letterboxd_diary()
    watched = [{k: v for k, v in e.items() if k != "_guid"} for e in entries]
    api_key = os.environ.get("TMDB_API_KEY")
    if api_key:
        watched = enrich_letterboxd_with_tmdb(watched, api_key)
    io.save_formatted_data("media/movies", {"watched": watched})


def get_latest_letterboxd_data():
    ratings = intake.load_latest_csv("letterboxd_ratings")
    reviews = intake.load_latest_csv("letterboxd_reviews")
    io.save_formatted_data("media/movies", transform_letterboxd(ratings, reviews))
