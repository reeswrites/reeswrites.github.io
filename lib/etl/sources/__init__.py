from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

from .. import config, intake, io, transforms

# Re-export everything so existing `sources.X` access keeps working.
from .activity import _is_publish_commit, generate_activity_feed
from .apple import (
    WORKOUT_DROP_FIELDS,
    WORKOUT_FIELD_MAPPING,
    get_latest_apple_health_data,
    get_latest_apple_workouts_data,
)
from .goodreads import (
    GOODREADS_CACHE_FILENAME,
    GOODREADS_DROP_FIELDS,
    _fetch_goodreads_shelf,
    _parse_goodreads_date,
    fetch_goodreads_shelves,
    get_goodreads_data_api,
    transform_goodreads,
)
from .google import (
    CALENDAR_API_CACHE_FILENAME,
    CALENDAR_SCOPES,
    GSPREAD_SCOPES,
    _google_credentials,
    _parse_lifting_workout,
    fetch_calendar_events,
    fetch_google_sheet_records,
    get_dvd_data_api,
    get_fragrance_data_api,
    get_games_data_api,
    get_lifting_data_api,
    get_records_data_api,
    transform_dvd,
    transform_fragrance,
    transform_fragrance_rows,
    transform_games,
    transform_lifting,
    transform_lifting_events,
    transform_records,
)
from .lastfm import (
    EXCLUDED_LASTFM_ARTISTS,
    LASTFM_API_ROOT,
    LASTFM_CACHE_FILENAME,
    _LASTFM_TS_FORMAT,
    _build_lastfm_insights,
    fetch_lastfm_scrobbles,
    generate_lastfm_insights,
    generate_lastfm_insights_api,
    transform_lastfm,
)
from .letterboxd import (
    LETTERBOXD_CACHE_FILENAME,
    LETTERBOXD_REVIEWS_DROP_FIELDS,
    TMDB_API_ROOT,
    TMDB_MOVIES_CACHE_FILENAME,
    _TMDB_OUTPUT_FIELDS,
    _fetch_tmdb_movie_details,
    _search_tmdb_movie,
    _tmdb_get,
    enrich_letterboxd_with_tmdb,
    fetch_letterboxd_diary,
    get_latest_letterboxd_data,
    get_letterboxd_data_api,
    seed_letterboxd_cache_from_csv,
    transform_letterboxd,
)
from .mal import (
    MAL_DROP_FIELDS,
    MAL_FIELD_MAPPING,
    get_english_anime_title,
    get_latest_mal_data,
)
from .trakt import (
    TRAKT_API_ROOT,
    TRAKT_CACHE_FILENAME,
    fetch_trakt_watched_shows,
    get_latest_trakt_data,
    get_trakt_data_api,
    transform_trakt_export,
)
from .untappd import (
    UNTAPPD_CACHE_FILENAME,
    fetch_untappd_checkins,
    get_untappd_data_api,
    seed_untappd_cache_from_csv,
)


@dataclass
class Source:
    input_name: str
    loader: Callable[[str], Any]
    transform: Callable[..., dict]
    output_name: str


def run_source(source: Source) -> None:
    data = source.loader(source.input_name)
    io.save_formatted_data(source.output_name, source.transform(data))


SOURCES: dict[str, Source] = {
    "books": Source("goodreads", intake.load_latest, transform_goodreads, "books"),
    "records": Source("records", intake.load_latest, transform_records, "records"),
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
    "beers_api": get_untappd_data_api,
    # Google Sheets / Calendar API sources (full load for inventories, delta for calendar)
    "dvd_api": get_dvd_data_api,
    "games_api": get_games_data_api,
    "records_api": get_records_data_api,
    "fragrance_api": get_fragrance_data_api,
    "lifting_api": get_lifting_data_api,
}

DEFAULT_SOURCES = ["books", "movies", "lifting", "games"]
