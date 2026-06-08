from __future__ import annotations

import json
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
        cleaned = " ".join(
            s.split()
        )  # normalise multiple spaces around single-digit day
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
        shelves = {s.strip() for s in book["bookshelves"].split(",") if s.strip()}
        if shelves & {"owned", "own"}:
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
                "date_added": _parse_goodreads_date(
                    item.get("user_date_added", "") or ""
                ),
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


GOOGLE_BOOKS_API_ROOT = "https://www.googleapis.com/books/v1/volumes"
GOOGLE_BOOKS_CACHE_FILENAME = "google-books-cache.json"
_GBOOKS_REQUIRED = frozenset({"genres", "cover"})


def _search_google_books(
    isbn: str, title: str, author: str, api_key: str | None
) -> dict:
    """Query Google Books for a book and return {genres, description, cover}.

    Values may be empty/None when not provided by the API.
    Raises requests.HTTPError on HTTP errors (including 429) so the caller can
    decide whether to cache the result or skip it.
    """
    params: dict = {"maxResults": 1}
    if api_key:
        params["key"] = api_key
    if isbn:
        params["q"] = f"isbn:{isbn}"
    else:
        params["q"] = f"intitle:{title} inauthor:{author}"

    resp = requests.get(
        GOOGLE_BOOKS_API_ROOT,
        params=params,
        headers={"Accept": "application/json"},
        timeout=10,
    )
    resp.raise_for_status()
    items = resp.json().get("items", [])
    if not items:
        return {}
    info = items[0].get("volumeInfo", {})
    return {
        "genres": info.get("categories", []),
        "description": info.get("description") or None,
        "cover": info.get("imageLinks", {}).get("thumbnail") or None,
    }


def _goodreads_book_key(book: dict) -> str:
    isbn = book.get("isbn13") or book.get("isbn") or ""
    return isbn if isbn else f"{book.get('title', '')}|{book.get('author', '')}"


def _merge_goodreads_csv(rss_books: list[dict], csv_books: list[dict]) -> list[dict]:
    """Fill missing publisher/additional_authors from csv_books into rss_books (fill-blanks)."""
    csv_by_key = {_goodreads_book_key(b): b for b in csv_books}
    result = []
    for book in rss_books:
        csv_book = csv_by_key.get(_goodreads_book_key(book))
        if csv_book:
            merged = dict(book)
            for field in ("publisher", "additional_authors"):
                if not merged.get(field) and csv_book.get(field):
                    merged[field] = csv_book[field]
            result.append(merged)
        else:
            result.append(book)
    return result


def enrich_goodreads_with_google_books(
    books: list[dict], api_key: str | None = None, enrich: bool = False
) -> list[dict]:
    """Enrich a flat list of book dicts with a ``genres`` field from Google Books.

    Cache: INPUT_DATA_DIR/google-books-cache.json, keyed by ISBN (isbn13 preferred,
    then isbn) or ``title|author`` when no ISBN is available.  A cached ``null``
    means the book was looked up and definitively not found or had no categories;
    it will not be re-fetched.  Rate-limited (429) responses are NOT cached so
    they will be retried on the next run.
    """
    cache_path = os.path.join(config.INPUT_DATA_DIR, GOOGLE_BOOKS_CACHE_FILENAME)
    cache: dict = {}
    if os.path.exists(cache_path):
        with open(cache_path, encoding="utf-8") as f:
            cache = json.load(f)

    newly_fetched = 0
    for book in books:
        isbn = book.get("isbn13") or book.get("isbn") or ""
        key = isbn if isbn else f"{book.get('title', '')}|{book.get('author', '')}"

        if key in cache:
            if not enrich:
                continue
            cached_entry = cache[key]
            if cached_entry is None:
                continue  # definitively not found previously
            if isinstance(cached_entry, list):
                cached_entry = {
                    "genres": cached_entry,
                    "description": None,
                    "cover": None,
                }
            if all(cached_entry.get(f) for f in _GBOOKS_REQUIRED):
                continue  # already have all required fields

        try:
            result = _search_google_books(
                isbn, book.get("title", ""), book.get("author", ""), api_key
            )
            cache[key] = result if result else None
            newly_fetched += 1
        except requests.HTTPError as exc:
            if exc.response is not None and exc.response.status_code == 429:
                logging.warning(
                    "Google Books: rate limited (429) — stopping enrichment for this run"
                )
                break
            logging.warning(
                f"Google Books: HTTP error for {isbn or book.get('title', '')!r}: {exc}"
            )
            cache[key] = None
            newly_fetched += 1
        except Exception as exc:
            logging.warning(
                f"Google Books: request failed for {isbn or book.get('title', '')!r}: {exc}"
            )
        sleep(random.uniform(0.05, 0.2))

    if newly_fetched:
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(cache, f, indent=4, ensure_ascii=False)
        logging.info(
            f"Google Books: fetched {newly_fetched} new books, {len(cache)} total in cache"
        )

    enriched = []
    for book in books:
        isbn = book.get("isbn13") or book.get("isbn") or ""
        key = isbn if isbn else f"{book.get('title', '')}|{book.get('author', '')}"
        entry = cache.get(key)
        if entry is None:
            enriched.append(book)
            continue
        # Backward-compat: old cache entries stored a bare list of categories.
        if isinstance(entry, list):
            entry = {"genres": entry, "description": None, "cover": None}
        merged = {**book}
        if entry.get("genres") and not merged.get("genres"):
            merged["genres"] = entry["genres"]
        if entry.get("description") and not merged.get("description"):
            merged["description"] = entry["description"]
        if entry.get("cover") and not merged.get("cover"):
            merged["cover"] = entry["cover"]
        enriched.append(merged)
    return enriched


def get_goodreads_data_api() -> None:
    """Fetch Goodreads shelves via RSS and write _data/media/books.json."""
    data = fetch_goodreads_shelves()

    # Always-CSV join: backfill publisher/additional_authors from the latest CSV.
    latest_csv_date = intake.latest_export_date("goodreads")
    if latest_csv_date:
        try:
            csv_rows = intake.load_latest("goodreads")
            csv_data = transform_goodreads(csv_rows)
            # Flatten all shelves into a key→record lookup (duplicates: last wins, same data).
            csv_by_key: dict = {}
            for shelf_books in csv_data.values():
                for b in shelf_books:
                    csv_by_key[_goodreads_book_key(b)] = b
            csv_books_flat = list(csv_by_key.values())
            for shelf_key, books in data.items():
                if isinstance(books, list) and books:
                    data[shelf_key] = _merge_goodreads_csv(books, csv_books_flat)
        except Exception as exc:
            logging.warning(f"Goodreads: CSV backfill failed: {exc}")

    # Thorough Google Books retry only when there's a newer CSV than the last enrich.
    enrich_date = intake.get_enrich_date("books_api")
    enrich = latest_csv_date is not None and (
        enrich_date is None or latest_csv_date > enrich_date
    )

    api_key = os.environ.get("GOOGLE_BOOKS_API_KEY")
    for shelf_key, books in data.items():
        if isinstance(books, list) and books:
            data[shelf_key] = enrich_goodreads_with_google_books(
                books, api_key, enrich=enrich
            )

    if enrich and latest_csv_date:
        intake.set_enrich_date("books_api", latest_csv_date)

    io.save_formatted_data("media/books", data)
