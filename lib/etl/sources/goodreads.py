from __future__ import annotations

import logging
import os
import random
from datetime import datetime
from time import sleep

import requests
import xmltodict

from .. import config, intake, io, transforms
from ._helpers import _strip_html

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

GOODREADS_CACHE_FILENAME = "goodreads-cache.json"
_GOODREADS_RSS_DATE_FORMAT = "%a %b %d %H:%M:%S %z %Y"

_GOODREADS_SHELF_MAP: dict[str, str] = {
    "read": "read",
    "currently-reading": "currently_reading",
    "owned": "owned",
}


def _parse_goodreads_date(s: str) -> str:
    """Parse a Goodreads RSS date like 'Sat Mar 24 00:00:00 -0800 2026' → 'YYYY/MM/DD'."""
    if not s:
        return ""
    try:
        cleaned = " ".join(s.split())  # normalise multiple spaces around single-digit day
        dt = datetime.strptime(cleaned, _GOODREADS_RSS_DATE_FORMAT)
        return dt.strftime("%Y/%m/%d")
    except (ValueError, TypeError):
        return ""


def transform_goodreads(rows: list[dict]) -> dict:
    dropped_data = transforms.drop_fields(rows, GOODREADS_DROP_FIELDS)
    mapped_data = transforms.map_fields(
        dropped_data,
        {k: transforms.convert_to_snake_case(k) for k in dropped_data[0].keys()},
    )
    mapped_data = transforms.map_fields(mapped_data, {"date_read": "date"})
    owned_books = []
    for book in mapped_data:
        book["exclusive_shelf"] = transforms.convert_to_snake_case(
            book["exclusive_shelf"]
        )
        if book["bookshelves"] != "" and "own" in book["bookshelves"]:
            owned_books.append(book)
        book["isbn"] = book["isbn"][1:].replace('"', "")
        book["isbn13"] = book["isbn13"][1:].replace('"', "")
        if "Whistling Vivaldi" in book["title"]:
            book["title"] = (
                "Whistling Vivaldi: How Stereotypes Affect Us and What We Can Do (Issues of Our Time)"
            )
    grouped_data = transforms.group_by(mapped_data, "exclusive_shelf")
    del grouped_data["to_read"]
    grouped_data["owned"] = owned_books
    return grouped_data


def _fetch_goodreads_shelf(user_id: str, shelf: str, per_page: int = 100) -> list[dict]:
    """Fetch all pages of one Goodreads shelf RSS feed and return mapped records."""
    base_url = f"https://www.goodreads.com/review/list_rss/{user_id}"
    records: list[dict] = []
    page = 1
    while True:
        resp = requests.get(
            base_url,
            params={"shelf": shelf, "per_page": per_page, "page": page},
            headers={"User-Agent": "personal-site-etl/1.0"},
        )
        resp.raise_for_status()
        feed = xmltodict.parse(resp.text)
        items = feed.get("rss", {}).get("channel", {}).get("item", [])
        if isinstance(items, dict):
            items = [items]

        for item in items:
            book_node = item.get("book") or {}
            record = {
                "title": _strip_html(item.get("title", "")),
                "author": _strip_html(item.get("author_name", "")),
                "additional_authors": "",
                "isbn": item.get("isbn", "") or "",
                "isbn13": item.get("isbn13", "") or "",
                "my_rating": str(item.get("user_rating", "0") or "0"),
                "average_rating": str(item.get("average_rating", "") or ""),
                "publisher": "",
                "number_of_pages": str(book_node.get("num_pages", "") or ""),
                "year_published": str(item.get("book_published", "") or ""),
                "original_publication_year": str(item.get("book_published", "") or ""),
                "date_read": _parse_goodreads_date(item.get("user_read_at", "") or ""),
                "date_added": _parse_goodreads_date(item.get("user_date_added", "") or ""),
                "bookshelves": _strip_html(item.get("user_shelves", "") or ""),
                "exclusive_shelf": transforms.convert_to_snake_case(shelf),
                "my_review": _strip_html(item.get("user_review", "") or ""),
            }
            records.append(record)

        logging.info(f"Goodreads {shelf}: page {page} — {len(items)} items")
        if len(items) < per_page:
            break
        page += 1
        sleep(random.uniform(0.5, 1.5))

    return records


def fetch_goodreads_shelves(_source_name: str | None = None) -> dict:
    """Fetch all configured Goodreads shelves via RSS.

    Reads GOODREADS_USER_ID from the environment.  No API key needed for
    public profiles.  Each call fetches the full shelf (not incremental),
    which is correct-by-construction for shelf membership changes.

    Returns a dict matching the _data/media/books.json shape::

        {
            "currently_reading": [...],
            "read": [...],
            "owned": [...],
            "partly_read": [],
        }

    Raises:
        ValueError: if GOODREADS_USER_ID is not set.
    """
    user_id = os.environ.get("GOODREADS_USER_ID")
    if not user_id:
        logging.error("Missing env var: GOODREADS_USER_ID")
        raise ValueError("Missing Goodreads env var: GOODREADS_USER_ID")

    result: dict[str, list] = {
        "currently_reading": [],
        "read": [],
        "owned": [],
        "partly_read": [],
    }
    for shelf, key in _GOODREADS_SHELF_MAP.items():
        try:
            result[key] = _fetch_goodreads_shelf(user_id, shelf)
            logging.info(f"Goodreads: {shelf!r} → {len(result[key])} books")
        except Exception as exc:
            logging.error(f"Goodreads: failed to fetch shelf {shelf!r}: {exc}")

    return result


def get_goodreads_data_api() -> None:
    """Fetch Goodreads shelves via RSS and write _data/media/books.json."""
    data = fetch_goodreads_shelves()
    io.save_formatted_data("media/books", data)
