from __future__ import annotations

import json
import logging
import os
import random
from datetime import datetime, timedelta
from time import sleep

import requests

from .. import config, intake

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

    # Build recent_tracks: top 100 most recent individual scrobbles.
    # Supports both API rows (have "uts") and CSV rows (have "scrobbled_at" string).
    def _row_dt(row: dict) -> datetime:
        uts = row.get("uts")
        if uts:
            return datetime.fromtimestamp(int(uts))
        ts = row.get("scrobbled_at", "")
        try:
            return datetime.strptime(ts, _LASTFM_TS_FORMAT)
        except (ValueError, TypeError):
            return datetime.min

    _RECENT_LIMIT = 100
    parsed_rows = [
        (r, _row_dt(r))
        for r in rows
        if r.get("artist", "").strip() and r.get("artist", "").strip() not in EXCLUDED_LASTFM_ARTISTS
    ]
    parsed_rows.sort(key=lambda x: x[1], reverse=True)
    recent_tracks = [
        {
            "artist": r["artist"].strip(),
            "album": r.get("album", "").strip(),
            "song": r.get("song", "").strip(),
            "date": dt.strftime("%Y-%m-%d"),
        }
        for r, dt in parsed_rows[:_RECENT_LIMIT]
        if dt != datetime.min
    ]

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
                    "recent_tracks": recent_tracks,
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
