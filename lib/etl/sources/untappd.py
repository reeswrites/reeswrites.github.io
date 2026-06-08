from __future__ import annotations

import json
import logging
import os
import re
from datetime import datetime

import requests
import xmltodict

from .. import config, intake, io, transforms
from ._helpers import _strip_html

UNTAPPD_CACHE_FILENAME = "untappd-cache.json"
_UNTAPPD_PUBDATE_FORMAT = "%a, %d %b %Y %H:%M:%S %z"
_UNTAPPD_TITLE_RE = re.compile(
    r".*? is drinking (?:a |an )?(.+?) by (.+?)(?:\s+at\s+(.+))?$"
)


def _parse_untappd_title(title: str) -> tuple[str, str, str]:
    """Parse 'User is drinking Beer by Brewery [at Venue]' → (beer, brewery, venue)."""
    m = _UNTAPPD_TITLE_RE.match(title)
    if not m:
        return title, "", ""
    return m.group(1), m.group(2), m.group(3) or ""


def _parse_untappd_date(pubdate: str) -> str:
    """Parse RFC 2822 pubDate like 'Sun, 31 May 2026 13:57:24 +0000' → 'YYYY-MM-DD HH:MM:SS' local time."""
    try:
        dt = datetime.strptime(pubdate.strip(), _UNTAPPD_PUBDATE_FORMAT)
        return dt.astimezone().strftime("%Y-%m-%d %H:%M:%S")
    except ValueError:
        return ""


def fetch_untappd_checkins(_source_name: str | None = None) -> list[dict]:
    """Fetch checkins from the Untappd RSS feed, incrementally.

    Maintains INPUT_DATA_DIR/untappd-cache.json: ``{ "checkins": [...] }``
    keyed by checkin ID extracted from the checkin URL.  The RSS only carries
    ~25 recent entries, so run ``seed_untappd_cache_from_csv()`` once before
    switching to this fetcher.

    Reads UNTAPPD_USER and UNTAPPD_RSS_KEY from the environment.

    Returns the full merged list of checkin dicts (includes ``_checkin_id``).
    """
    user = os.environ.get("UNTAPPD_USER")
    key = os.environ.get("UNTAPPD_RSS_KEY")
    if not user or not key:
        logging.error("Missing env vars: UNTAPPD_USER, UNTAPPD_RSS_KEY")
        raise ValueError("Missing Untappd env vars: UNTAPPD_USER, UNTAPPD_RSS_KEY")

    cache_path = os.path.join(config.INPUT_DATA_DIR, UNTAPPD_CACHE_FILENAME)
    if os.path.exists(cache_path):
        with open(cache_path, encoding="utf-8") as f:
            cache = json.load(f)
        cached_entries: list[dict] = cache.get("checkins", [])
    else:
        cached_entries = []

    seen_ids: set[str] = {
        e["_checkin_id"] for e in cached_entries if "_checkin_id" in e
    }

    feed_url = f"https://untappd.com/rss/user/{user}?key={key}"
    resp = requests.get(feed_url, headers={"User-Agent": "personal-site-etl/1.0"})
    resp.raise_for_status()

    feed = xmltodict.parse(resp.text)
    items = feed.get("rss", {}).get("channel", {}).get("item", [])
    if isinstance(items, dict):
        items = [items]

    new_entries: list[dict] = []
    for item in items:
        link = item.get("link", "")
        checkin_id = link.rstrip("/").split("/")[-1]
        if checkin_id in seen_ids:
            continue

        beer_name, brewery_name, venue_name = _parse_untappd_title(
            item.get("title", "")
        )
        description = item.get("description", "") or ""
        comment = _strip_html(description).strip() if description else ""

        entry: dict = {
            "beer_name": beer_name,
            "brewery_name": brewery_name,
            "comment": comment,
            "created_at": _parse_untappd_date(item.get("pubDate", "")),
            "checkin_url": link,
            "checkin_id": checkin_id,
            "_checkin_id": checkin_id,
        }
        if venue_name:
            entry["venue_name"] = venue_name

        new_entries.append(entry)
        seen_ids.add(checkin_id)

    all_entries = cached_entries + new_entries
    with open(cache_path, "w", encoding="utf-8") as f:
        json.dump({"checkins": all_entries}, f, indent=4, ensure_ascii=False)

    logging.info(f"Untappd: {len(new_entries)} new, {len(all_entries)} total in cache")
    return all_entries


def _load_untappd_csv() -> list[dict]:
    """Load the latest dated untappd CSV (excludes untappd-cache.json etc.)."""
    import csv as _csv

    files = intake.list_dated_exports("untappd")
    if not files:
        return []
    latest = intake.get_latest_data_file(files)
    rows = list(_csv.DictReader(intake.get_data_from_file(latest).splitlines()))
    for row in rows:
        bom_key = "﻿beer_name"
        if bom_key in row:
            row["beer_name"] = row.pop(bom_key)
        if "_checkin_id" not in row:
            row["_checkin_id"] = row.get("checkin_id", "")
    return rows


def seed_untappd_cache_from_csv() -> None:
    """One-time: seed the Untappd cache from the committed CSV export.

    Loads the latest ``untappd-YYYY-MM-DD.csv`` from INPUT_DATA_DIR and merges
    it into the cache file (fill-blanks).  Assigns ``_checkin_id`` from the CSV
    ``checkin_id`` column so subsequent RSS runs dedup correctly.

    Typical use — run once in a Python shell before the first RSS fetch::

        from lib.etl import sources
        sources.seed_untappd_cache_from_csv()
    """
    cache_path = os.path.join(config.INPUT_DATA_DIR, UNTAPPD_CACHE_FILENAME)
    existing: list[dict] = []
    if os.path.exists(cache_path):
        with open(cache_path, encoding="utf-8") as f:
            existing = json.load(f).get("checkins", [])

    rows = _load_untappd_csv()
    if not rows:
        logging.warning("No untappd CSV found; skipping seed.")
        return

    merged = transforms.merge_records(existing, rows, pk="checkin_id", fill_only=True)

    with open(cache_path, "w", encoding="utf-8") as f:
        json.dump({"checkins": merged}, f, indent=4, ensure_ascii=False)
    logging.info(
        f"Untappd seed: {len(merged) - len(existing)} entries added from CSV, {len(merged)} total"
    )


def get_untappd_data_api() -> None:
    """Fetch Untappd checkins from RSS and write _data/beers.json."""
    latest_csv_date = intake.latest_export_date("untappd")
    enrich_date = intake.get_enrich_date("beers_api")
    enrich = latest_csv_date is not None and (
        enrich_date is None or latest_csv_date > enrich_date
    )

    if enrich:
        seed_untappd_cache_from_csv()
        intake.set_enrich_date("beers_api", latest_csv_date)

    entries = fetch_untappd_checkins()
    entries.sort(key=lambda e: e.get("created_at", ""))
    checkins = [{k: v for k, v in e.items() if k != "_checkin_id"} for e in entries]
    io.save_formatted_data("beers", {"checkins": checkins})
