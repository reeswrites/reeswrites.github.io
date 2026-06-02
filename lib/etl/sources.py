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
from datetime import datetime
from random import randint
from time import sleep
from typing import Any, Callable

import requests
import xmltodict
from icalendar import Calendar
from lxml import etree

from . import config
from . import intake
from . import io
from . import transforms

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
    mapped_data = transforms.map_fields(dropped_data, {k: transforms.convert_to_snake_case(k) for k in dropped_data[0].keys()})
    mapped_data = transforms.map_fields(mapped_data, {"date_read": "date"})
    owned_books = []
    for book in mapped_data:
        book["exclusive_shelf"] = transforms.convert_to_snake_case(book["exclusive_shelf"])
        if book["bookshelves"] != "" and "own" in book["bookshelves"]:
            owned_books.append(book)
        book["isbn"] = book["isbn"][1:].replace('"', '')
        book["isbn13"] = book["isbn13"][1:].replace('"', '')
        if "Whistling Vivaldi" in book["title"]:
            book["title"] = "Whistling Vivaldi: How Stereotypes Affect Us and What We Can Do (Issues of Our Time)"
    grouped_data = transforms.group_by(mapped_data, "exclusive_shelf")
    del grouped_data["to_read"]
    grouped_data["owned"] = owned_books
    return grouped_data


def transform_letterboxd(ratings_rows: list[dict], reviews_rows: list[dict]) -> dict:
    mapped_ratings = transforms.map_fields(ratings_rows, {k: transforms.convert_to_snake_case(k) for k in ratings_rows[0].keys()})
    mapped_reviews = transforms.map_fields(reviews_rows, {k: transforms.convert_to_snake_case(k) for k in reviews_rows[0].keys()})
    dropped_reviews = transforms.drop_fields(mapped_reviews, LETTERBOXD_REVIEWS_DROP_FIELDS)
    return {"watched": transforms.left_join_by(mapped_ratings, dropped_reviews, ["name", "year"])}


def transform_records(rows: list[dict]) -> dict:
    dropped_data = transforms.drop_fields(rows, (
        "Date Received", "Lead Time", "Record Cost", "Shipping Cost",
        "Tax", "Total Cost", "Retailer Name", "Online/Physical", "Location",
    ))
    mapped_data = transforms.map_fields(dropped_data, {
        "Album Name": "album_name",
        "Artist Name": "artist_name",
        "Year Released": "release_date",
        "Date Purchased": "date",
    })
    for record in mapped_data:
        record["date"] = datetime.strftime(
            datetime.strptime(record.get("date"), "%m/%d/%Y"),
            "%Y-%m-%d",
        )
    return {"owned": mapped_data}


def transform_swimming(rows: list[dict]) -> dict:
    STROKE_DECODER = {
        "BR": "Breastroke", "FR": "Freestyle", "BK": "Backstroke",
        "FL": "Butterfly", "IM": "Individual Medley",
    }
    dropped_data = transforms.drop_fields(rows, ("LSC", "TEAM", "POINTS", "TIME STANDARD"))
    mapped_data = transforms.map_fields(dropped_data, {
        "EVENT": "event", "SWIM TIME": "time", "AGE": "age", "MEET": "meet", "SWIM DATE": "date",
    })
    for entry in mapped_data:
        distance, stroke, course = entry["event"].split(" ")
        entry["event"] = {
            "distance": int(distance),
            "unit": "Yard" if "Y" in course else "Meter",
            "stroke": STROKE_DECODER[stroke],
            "course": "Short" if "S" in course else "Long",
        }
    return {"times": mapped_data}


def transform_lastfm(rows: list[dict]) -> dict:
    grouped_scrobbles: dict = {}
    for scrobble in rows:
        artist = scrobble["artist"]
        album = scrobble["album"]
        song = scrobble["song"]
        grouped_scrobbles.setdefault(artist, {}).setdefault(album, {})
        grouped_scrobbles[artist][album][song] = grouped_scrobbles[artist][album].get(song, 0) + 1
    for excluded_artist in [
        "", "", "",
        "",
        "",
        "", "", "",
    ]:
        del grouped_scrobbles[excluded_artist]
    scrobbles_by_song = [
        {"artist": artist, "album": album, "song": song, "scrobbles": count}
        for artist, albums in grouped_scrobbles.items()
        for album, songs in albums.items()
        for song, count in songs.items()
    ]
    return {"scrobbles": scrobbles_by_song}


def transform_lifting(raw_text: str) -> dict:
    gcal = Calendar.from_ical(raw_text)
    workouts = []
    for component in gcal.walk():
        name = component.get("summary")
        if not (name and "workout" in name and any(k in name for k in ("push", "pull", "lift", "full"))):
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
            data.append({"name": exercise.title(), "sets": sets, "weight": float(weight)})
        if "push" in name:
            lift_type = "push"
        elif "pull" in name:
            lift_type = "pull"
        elif "full body a" in name:
            lift_type = "full body a"
        elif "full body b" in name:
            lift_type = "full body b"
        workouts.append({
            "type": lift_type,
            "exercises": data,
            "date": datetime.strftime(component.get("dtstart").dt, "%Y-%m-%d"),
            "time": datetime.strftime(component.get("dtstart").dt, "%H:%M"),
        })
    return {"workouts": workouts}


def transform_dvd(rows: list[dict]) -> dict:
    dropped_data = transforms.drop_fields(rows, [
        "item_type", "first_name", "last_name", "publisher", "group", "tags", "notes",
        "price", "length", "number_of_discs", "number_of_players", "esrb", "aspect_ratio",
        "age_group", "ensemble", "rating", "review", "review_date", "status", "began",
        "completed", "copies",
    ])
    for movie in dropped_data:
        published_date = movie["publish_date"]
        if len(published_date.split("-")) == 3:
            movie["publish_date"] = published_date.split("-")[0]
    transforms.map_fields(dropped_data, {"added": "date"})
    return {"dvds": dropped_data}


def transform_fragrance(wb) -> dict:
    inventory = transforms.drop_fields(transforms.excel_to_dict(wb["Own"]), ["price", "notes"])
    wishlist = transforms.drop_fields(transforms.excel_to_dict(wb["Wishlist"]), ["price", "notes"])
    return {"own": inventory, "want": wishlist}


def transform_games(rows: list[dict]) -> dict:
    mapped_data = transforms.map_fields(rows, {k: transforms.convert_to_snake_case(k) for k in rows[0].keys()})
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
                {"number": ep["number"], "date": ep["last_watched_at"]}
                for ep in season["episodes"]
            ]
            seasons.append({
                "season": season["number"],
                "watched": watched,
                "episodes": len(watched),
            })
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
    filtered_mal_data = transforms.filter_key_by_list(mapped_mal_data, "japanese_title", MAL_FILTER_LIST)

    for show in filtered_mal_data:
        english_title = get_english_anime_title(show["anime_id"])
        if english_title is not None:
            logging.info(f"Found English title {english_title} for {show['japanese_title']}")
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
    io.save_formatted_data("movies", transform_letterboxd(ratings, reviews))


def get_latest_apple_workouts_data():
    logging.info("Parsing Apple Health data...")

    apple_health_files = intake.get_files_by_source("apple_health")
    latest_apple_health_file = intake.get_latest_data_file(apple_health_files)

    daily_steps: dict = defaultdict(int)
    workout_list = []

    with open(os.path.join(config.INPUT_DATA_DIR, latest_apple_health_file)) as file:
        tree = etree.parse(file)

        for record in tree.getroot().xpath("Record[@type='HKQuantityTypeIdentifierStepCount']"):
            date_obj = datetime.strptime(
                record.get("startDate"), "%Y-%m-%d %H:%M:%S %z"
            ).date().isoformat()
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
                    workout[child.get("type").replace("HKQuantityTypeIdentifier", "")] = child.get("sum")

            workout["@workoutActivityType"] = record.get("workoutActivityType").replace("HKWorkoutActivityType", "").lower()
            workout["@startDate"] = datetime.strftime(
                datetime.strptime(record.get("startDate"), "%Y-%m-%d %H:%M:%S %z"), "%Y-%m-%d %H:%M:%S"
            )
            workout["@endDate"] = datetime.strftime(
                datetime.strptime(record.get("endDate"), "%Y-%m-%d %H:%M:%S %z"), "%Y-%m-%d %H:%M:%S"
            )
            mins, sec_dec = record.get("duration").split(".")
            workout["@duration"] = f"{mins} minute(s) and {round(60 * float('.' + sec_dec))} second(s)"
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


def get_latest_apple_health_data():
    export_dir = os.path.join(config.INPUT_DATA_DIR, intake._latest_filename("apple_health"))
    logging.info(f"Using Apple Health export: {export_dir}")

    # --- step counts ---
    daily_steps: dict[str, int] = defaultdict(int)
    with open(intake.find_in_dir(export_dir, "Step Count*.csv")) as f:
        reader = csv.DictReader(f)
        date_col = "Date/Time" if "Date/Time" in reader.fieldnames else "Date"
        steps_col = "Step Count (count)" if "Step Count (count)" in reader.fieldnames else "Step Count (steps)"
        for row in reader:
            daily_steps[transforms.get_date_from_datetime(row[date_col])] = int(row[steps_col])

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
            dist = float(row["Distance (mi)"]) if dist_col else float(row["Distance (km)"]) * 0.621371
            if dist > 0:
                workout["distance"] = str(round(dist, 2))
            hr_col = "Avg. Heart Rate (bpm)" if "Avg. Heart Rate (bpm)" in row else "Avg. Heart Rate (count/min)"
            if row[hr_col]:
                workout["averageHR"] = str(round(float(row[hr_col]), 2))
            workouts.append(workout)

    new_workouts = sorted(workouts, key=lambda x: x["startTime"])
    cardio_path = os.path.join(config.OUTPUT_DATA_DIR, "cardio.json")
    with open(cardio_path) as f:
        old_workouts = json.load(f)["workouts"]
    upserted_workouts = transforms.upsert_data(old_workouts, new_workouts, pk="startTime")
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

    movies_path = os.path.join(config.OUTPUT_DATA_DIR, "movies.json")
    if os.path.exists(movies_path):
        with open(movies_path, encoding="utf8") as f:
            data = json.load(f)
        movies = data if isinstance(data, list) else data.get("watched", data.get("movies", []))
        for m in movies:
            if not m.get("date"):
                continue
            entry = {"date": m["date"], "type": "movie", "label": m["name"]}
            if m.get("rating"):
                entry["detail"] = f"{m['rating']}/5"
            entries.append(entry)

    books_path = os.path.join(config.OUTPUT_DATA_DIR, "books.json")
    if os.path.exists(books_path):
        with open(books_path, encoding="utf8") as f:
            data = json.load(f)
        for book in data.get("read", []):
            raw_date = book.get("date", "")
            if not raw_date:
                continue
            entries.append({
                "date": raw_date.replace("/", "-"),
                "type": "book",
                "label": book["title"],
                "detail": f"by {book['author']}",
            })

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
            entries.append({"date": s["date"], "type": "steps", "label": f"{int(s['steps']):,} steps"})

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
                entries.append({
                    "date": date,
                    "type": "tv",
                    "label": title,
                    "detail": f"{count} episode{'s' if count != 1 else ''}",
                })

    changelog_path = os.path.join(site_data, "changelog.json")
    if os.path.exists(changelog_path):
        with open(changelog_path, encoding="utf8") as f:
            data = json.load(f)
        for day in data.get("entries", []):
            if not day.get("date") or not day.get("entries"):
                continue
            entries.append({"date": day["date"], "type": "changelog", "entries": day["entries"]})

    entries.sort(key=lambda e: e["date"], reverse=True)

    out_path = os.path.join(config.SITE_ROOT, "static", "data", "activity.json")
    with open(out_path, "w", encoding="utf8") as f:
        f.write(json.dumps(
            {"entries": entries, "last_updated": datetime.today().strftime("%Y-%m-%d")},
            indent=4, ensure_ascii=False,
        ))
    logging.info(f"Activity feed: {len(entries)} entries → {out_path}")


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
    "books":     Source("goodreads",  intake.load_latest,        transform_goodreads,  "books"),
    "records":   Source("records",    intake.load_latest,        transform_records,    "records"),
    "swimming":  Source("swim_times", intake.load_latest,        transform_swimming,   "swimming"),
    "dvd":       Source("dvd",        intake.load_latest,        transform_dvd,        "dvd"),
    "games":     Source("games",      intake.load_latest,        transform_games,      "games"),
    "lastfm":    Source("lastfm",     intake.load_latest_lastfm, transform_lastfm,     "lastfm"),
    "lifting":   Source("calendar",   intake.load_latest,        transform_lifting,    "lifting"),
    "fragrance": Source("fragrance",  intake.load_latest,        transform_fragrance,  "fragrance"),
}

SOURCE_MAP: dict[str, Source | Callable] = {
    **SOURCES,
    # complex sources: multiple inputs, multiple outputs, or network-only
    "movies":        get_latest_letterboxd_data,
    "workouts":      get_latest_apple_workouts_data,
    "apple_health":  get_latest_apple_health_data,
    "mal":           get_latest_mal_data,
    "trakt":         get_latest_trakt_data,
    "activity":      generate_activity_feed,
}

DEFAULT_SOURCES = ["books", "movies", "lifting", "games"]
