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
    GOOGLE_BOOKS_API_ROOT,
    GOOGLE_BOOKS_CACHE_FILENAME,
    _fetch_goodreads_shelf,
    _goodreads_book_key,
    _merge_goodreads_csv,
    _parse_goodreads_date,
    _search_google_books,
    enrich_goodreads_with_google_books,
    fetch_goodreads_shelves,
    get_goodreads_data_api,
    transform_goodreads,
)
from .google import (
    CALENDAR_API_CACHE_FILENAME,
    CALENDAR_SCOPES,
    DISCOGS_API_ROOT,
    DISCOGS_RECORDS_CACHE_FILENAME,
    GSPREAD_SCOPES,
    LASTFM_ARTIST_CACHE_FILENAME,
    _clean_dvd_title,
    _fetch_discogs_album,
    _fetch_lastfm_artist_bio,
    _google_credentials,
    _parse_lifting_workout,
    enrich_dvds_with_tmdb,
    enrich_records_with_discogs_lastfm,
    fetch_calendar_events,
    fetch_google_sheet_records,
    get_dvd_data,
    get_fragrance_data_api,
    get_games_data_api,
    get_lifting_data_api,
    get_records_data_api,
    transform_dvd,
    transform_fragrance_rows,
    transform_games,
    transform_lifting_events,
    transform_records,
)
from .lastfm import (
    _LASTFM_TS_FORMAT,
    EXCLUDED_LASTFM_ARTISTS,
    LASTFM_API_ROOT,
    LASTFM_CACHE_FILENAME,
    LASTFM_TRACK_TAGS_CACHE_FILENAME,
    _build_lastfm_insights,
    enrich_lastfm_with_tags,
    fetch_lastfm_scrobbles,
    generate_lastfm_insights,
    get_lastfm_music_api,
    transform_lastfm,
)
from .letterboxd import (
    _TMDB_OUTPUT_FIELDS,
    _TMDB_REQUIRED,
    LETTERBOXD_CACHE_FILENAME,
    LETTERBOXD_REVIEWS_DROP_FIELDS,
    TMDB_API_ROOT,
    TMDB_MOVIES_CACHE_FILENAME,
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
from .trakt import (
    TMDB_TV_CACHE_FILENAME,
    TRAKT_API_ROOT,
    TRAKT_CACHE_FILENAME,
    enrich_trakt_with_tmdb,
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
}

SOURCE_MAP: dict[str, Source | Callable] = {
    **SOURCES,
    # complex sources: multiple inputs, multiple outputs, or network-only
    "movies": get_latest_letterboxd_data,
    "workouts": get_latest_apple_workouts_data,
    "apple_health": get_latest_apple_health_data,
    "trakt": get_latest_trakt_data,
    "activity": generate_activity_feed,
    "lastfm_insights": generate_lastfm_insights,
    # API/RSS-backed incremental sources (no manual export needed)
    "trakt_api": get_trakt_data_api,
    "movies_api": get_letterboxd_data_api,
    "books_api": get_goodreads_data_api,
    "beers_api": get_untappd_data_api,
    # Google Sheets / Calendar API sources (full load for inventories, delta for calendar)
    "dvd": get_dvd_data,
    "games_api": get_games_data_api,
    "records_api": get_records_data_api,
    "fragrance_api": get_fragrance_data_api,
    "lifting_api": get_lifting_data_api,
    "music_api": get_lastfm_music_api,
}

DEFAULT_SOURCES = [
    # file-based sources
    "apple_health",
    "trakt",
    # API-backed incremental sources
    "trakt_api",
    "movies_api",
    "books_api",
    "beers_api",
    "dvd",
    "games_api",
    "records_api",
    "fragrance_api",
    "lifting_api",
    "music_api",
    # derived / aggregated
    "lastfm_insights",
    # always last — depends on everything above
    "activity",
]
