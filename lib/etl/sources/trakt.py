from __future__ import annotations

import json
import logging
import os
import random
from time import sleep

import requests

from .. import config, intake, io
from ._helpers import screen_text
from .letterboxd import _tmdb_get

TRAKT_API_ROOT = "https://api.trakt.tv"
TRAKT_CACHE_FILENAME = "trakt-cache.json"
TRAKT_TOKENS_FILENAME = "trakt-tokens.json"
TMDB_TV_CACHE_FILENAME = "tmdb-tv-cache.json"


def _load_trakt_tokens() -> dict:
    """Load tokens from file cache first, falling back to env vars."""
    path = os.path.join(config.INPUT_DATA_DIR, TRAKT_TOKENS_FILENAME)
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    return {
        "access_token": os.environ.get("TRAKT_ACCESS_TOKEN"),
        "refresh_token": os.environ.get("TRAKT_REFRESH_TOKEN"),
    }


def _save_trakt_tokens(tokens: dict) -> None:
    path = os.path.join(config.INPUT_DATA_DIR, TRAKT_TOKENS_FILENAME)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(tokens, f, indent=4, ensure_ascii=False)
    logging.info("Trakt: saved refreshed tokens to file")


def _refresh_trakt_access_token(client_id: str, client_secret: str, refresh_token: str) -> dict:
    """Exchange refresh_token for new access + refresh tokens via Trakt OAuth."""
    resp = requests.post(
        f"{TRAKT_API_ROOT}/oauth/token",
        json={
            "refresh_token": refresh_token,
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": "urn:ietf:wg:oauth:2.0:oob",
            "grant_type": "refresh_token",
        },
    )
    resp.raise_for_status()
    return resp.json()


def _trakt_get(url: str, headers: dict, client_id: str, client_secret: str | None, **kwargs) -> requests.Response:
    """GET with one automatic token refresh on 401."""
    resp = requests.get(url, headers=headers, **kwargs)
    if resp.status_code != 401 or not client_secret:
        resp.raise_for_status()
        return resp

    tokens = _load_trakt_tokens()
    refresh_token = tokens.get("refresh_token")
    if not refresh_token:
        resp.raise_for_status()
        return resp

    logging.info("Trakt: access token expired, refreshing...")
    new_tokens = _refresh_trakt_access_token(client_id, client_secret, refresh_token)
    _save_trakt_tokens(new_tokens)

    headers = {**headers, "Authorization": f"Bearer {new_tokens['access_token']}"}
    resp = requests.get(url, headers=headers, **kwargs)
    resp.raise_for_status()
    return resp


def fetch_trakt_watched_shows(_source_name: str | None = None) -> list[dict]:
    """Fetch watched shows from the Trakt API, incrementally.

    Compares ``episodes.watched_at`` from ``GET /sync/last_activities`` against
    the locally-cached value; skips a full refresh when nothing has changed.

    Reads TRAKT_CLIENT_ID from env. Access token loaded from
    INPUT_DATA_DIR/trakt-tokens.json first, falling back to TRAKT_ACCESS_TOKEN env var.
    On 401, auto-refreshes using TRAKT_CLIENT_SECRET + TRAKT_REFRESH_TOKEN and saves
    new tokens to the file (never modifies .env).

    Cache: INPUT_DATA_DIR/trakt-cache.json → ``{ "watched_at": <iso>, "shows": [...] }``

    Returns the full list of watched-show dicts in the Trakt export shape.

    Raises:
        ValueError: if TRAKT_CLIENT_ID or access token are not set.
    """
    client_id = os.environ.get("TRAKT_CLIENT_ID")
    client_secret = os.environ.get("TRAKT_CLIENT_SECRET")
    tokens = _load_trakt_tokens()
    access_token = tokens.get("access_token")

    if not client_id or not access_token:
        missing = [k for k, v in (("TRAKT_CLIENT_ID", client_id), ("TRAKT_ACCESS_TOKEN", access_token)) if not v]
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
    resp = _trakt_get(f"{TRAKT_API_ROOT}/sync/last_activities", headers, client_id, client_secret)
    latest_watched_at: str | None = resp.json().get("episodes", {}).get("watched_at")

    if latest_watched_at and latest_watched_at == cached_watched_at:
        logging.info(f"Trakt: nothing new since {cached_watched_at}, returning cache")
        return cached_shows

    logging.info("Trakt: fetching full watched-shows list...")
    resp = _trakt_get(
        f"{TRAKT_API_ROOT}/sync/watched/shows",
        headers,
        client_id,
        client_secret,
        params={"extended": "full"},
    )
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
        tmdb_id = show.get("ids", {}).get("tmdb")
        if tmdb_id:
            show_entry["tmdb_id"] = tmdb_id
        data.append(show_entry)
    return data


def enrich_trakt_with_tmdb(shows: list[dict], api_key: str) -> list[dict]:
    """Enrich Trakt show dicts with TMDB genre and per-season episode-count data.

    Cache: INPUT_DATA_DIR/tmdb-tv-cache.json, keyed by TMDB id (as a string).
    A cached ``None`` means the show was already looked up and not found / errored;
    it will not be re-fetched.  Rate-limiting is handled by a small random sleep
    between calls.

    Merges onto each show:
      - ``genres``: list of genre name strings from TMDB.
      - ``origin_country``: list of ISO 3166-1 alpha-2 country codes (e.g. ["JP"]).
      - ``seasons[*].total_episodes``: real episode count for that season number
        (left absent when TMDB has no data for that season).
    """
    cache_path = os.path.join(config.INPUT_DATA_DIR, TMDB_TV_CACHE_FILENAME)
    cache: dict = {}
    if os.path.exists(cache_path):
        with open(cache_path, encoding="utf-8") as f:
            cache = json.load(f)

    newly_fetched = 0
    for show in shows:
        tmdb_id = show.get("tmdb_id")
        if not tmdb_id:
            continue
        key = str(tmdb_id)
        if key in cache:
            continue
        try:
            data = _tmdb_get(
                f"/tv/{tmdb_id}", api_key, {"append_to_response": "credits"}
            )
            season_counts = {
                str(s["season_number"]): s["episode_count"]
                for s in data.get("seasons", [])
            }
            run_times = data.get("episode_run_time", [])
            cast = [c["name"] for c in data.get("credits", {}).get("cast", [])[:5]]
            cache[key] = {
                "genres": [g["name"] for g in data.get("genres", [])],
                "origin_country": data.get("origin_country", []),
                "episode_run_time": run_times[0] if run_times else None,
                "season_episode_counts": season_counts,
                "tmdb_score": data.get("vote_average"),
                "overview": data.get("overview") or None,
                "poster_path": data.get("poster_path") or None,
                "cast": cast or None,
            }
        except Exception as exc:
            logging.warning(f"TMDB TV: failed for id={tmdb_id}: {exc}")
            cache[key] = None
        newly_fetched += 1
        sleep(random.uniform(0.05, 0.2))

    if newly_fetched:
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(cache, f, indent=4, ensure_ascii=False)
        logging.info(
            f"TMDB TV: fetched {newly_fetched} new shows, {len(cache)} total in cache"
        )

    enriched = []
    for show in shows:
        tmdb_id = show.get("tmdb_id")
        tmdb = cache.get(str(tmdb_id)) if tmdb_id else None
        if not tmdb:
            enriched.append(show)
            continue
        show = {**show}
        if tmdb.get("genres"):
            show["genres"] = tmdb["genres"]
        if tmdb.get("origin_country"):
            show["origin_country"] = tmdb["origin_country"]
        if tmdb.get("episode_run_time") is not None:
            show["episode_run_time"] = tmdb["episode_run_time"]
        if tmdb.get("overview"):
            show["overview"] = screen_text(
                tmdb["overview"], label=show.get("title", "")
            )
        if tmdb.get("poster_path"):
            show["poster_path"] = tmdb["poster_path"]
        if tmdb.get("cast"):
            show["cast"] = tmdb["cast"]
        season_counts: dict = tmdb.get("season_episode_counts", {})
        if season_counts and show.get("seasons"):
            updated_seasons = []
            for season in show["seasons"]:
                total = season_counts.get(str(season["season"]))
                if total is not None:
                    season = {**season, "total_episodes": total}
                updated_seasons.append(season)
            show["seasons"] = updated_seasons
        enriched.append(show)
    return enriched


_MAL_FIELDS = (
    "is_anime",
    "mal_score",
    "mal_status",
    "mal_watched_episodes",
    "mal_total_episodes",
    "japanese_title",
)


def _carry_forward_mal(trakt_shows: list[dict]) -> list[dict]:
    """Merge MAL metadata and MAL-only shows from the existing tv.json output.

    MAL is no longer updated, so its data is preserved by reading the current
    output file and stitching it back onto the freshly-fetched Trakt list.
    Shows that exist only in MAL (no seasons) are appended; MAL fields on
    Trakt shows (is_anime, mal_score, japanese_title, etc.) are merged in.
    """
    tv_path = os.path.join(config.OUTPUT_DATA_DIR, "media", "tv.json")
    mal_meta: dict[str, dict] = {}
    mal_only: list[dict] = []
    if os.path.exists(tv_path):
        with open(tv_path) as f:
            existing = json.load(f)
        for show in existing.get("shows", []):
            meta = {k: show[k] for k in _MAL_FIELDS if k in show}
            if show.get("seasons"):
                if meta:
                    mal_meta[show["title"]] = meta
            else:
                mal_only.append(show)

    trakt_titles = set()
    for show in trakt_shows:
        trakt_titles.add(show["title"])
        if show["title"] in mal_meta:
            show.update(mal_meta[show["title"]])

    return trakt_shows + [s for s in mal_only if s["title"] not in trakt_titles]


def get_trakt_data_api() -> None:
    """Fetch watched shows from the Trakt API and write _data/media/tv.json."""
    shows = fetch_trakt_watched_shows()
    transformed = transform_trakt_export(shows)
    transformed = _carry_forward_mal(transformed)
    api_key = os.environ.get("TMDB_API_KEY")
    if api_key:
        transformed = enrich_trakt_with_tmdb(transformed, api_key)
    io.save_formatted_data("media/tv", {"shows": transformed})


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
    merged = _carry_forward_mal(trakt_shows)
    api_key = os.environ.get("TMDB_API_KEY")
    if api_key:
        merged = enrich_trakt_with_tmdb(merged, api_key)
    io.save_formatted_data("media/tv", {"shows": merged})
