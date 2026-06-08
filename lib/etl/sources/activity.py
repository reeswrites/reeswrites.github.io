from __future__ import annotations

import json
import logging
import os
from collections import defaultdict
from datetime import datetime

from .. import config


def _is_publish_commit(message: str) -> bool:
    """Return True if the commit message is a post-publishing commit.

    Posts already appear as their own feed entries (from site.posts), so
    changelog lines like 'publish how to try more beer' or 'publish: x'
    would create duplicates in the activity feed.
    """
    return message.strip().lower().startswith("publish")


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
            if m.get("year"):
                entry["year"] = m["year"]
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
            beers_data = json.load(f)
        beers = (
            beers_data
            if isinstance(beers_data, list)
            else beers_data.get("checkins", [])
        )
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
            # Posts already appear as their own feed entries; drop changelog
            # lines that are just a publish commit to avoid duplicates.
            kept = [m for m in day["entries"] if not _is_publish_commit(m)]
            if not kept:
                continue
            entries.append({"date": day["date"], "type": "changelog", "entries": kept})

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
