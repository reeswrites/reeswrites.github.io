from __future__ import annotations

import logging
import os
import random
from time import sleep

import requests
import xmltodict

from .. import config, intake, io, transforms

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


def get_english_anime_title(anime_id: str) -> str | None:
    """Fetch the English alternative title for an anime from the MyAnimeList API."""
    response = requests.get(
        url=f"https://api.myanimelist.net/v2/anime/{anime_id}?fields=alternative_titles",
        headers={"X-MAL-CLIENT-ID": os.environ.get("MAL_CLIENT_ID")},
    )
    data = response.json()
    english_title = data["alternative_titles"]["en"]
    return english_title if english_title != "" else None


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
    filter_raw = os.environ.get("MAL_FILTER_LIST", "")
    mal_filter = tuple(t.strip() for t in filter_raw.split(",") if t.strip())
    filtered_mal_data = transforms.filter_key_by_list(
        mapped_mal_data, "japanese_title", mal_filter
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
