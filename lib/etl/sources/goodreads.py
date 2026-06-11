from __future__ import annotations

import json
import logging
import os
import random
import re
from datetime import datetime
from time import sleep

import requests
import xmltodict

from .. import config, intake, io, transforms
from ._helpers import _strip_html, screen_tags, screen_text

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

OPENLIBRARY_BOOKS_API = "https://openlibrary.org/api/books"
OPENLIBRARY_SUBJECTS_CACHE_FILENAME = "openlibrary-subjects-cache.json"
_OL_USER_AGENT = "reeswrites.com-etl/1.0 (rees.draminski@gmail.com)"
_OL_CHUNK_SIZE = 75
_OL_MAX_TAG_LEN = 60
_OL_METADATA_PREFIX_RE = re.compile(r"^[A-Za-z0-9]+:")
_OL_NON_ASCII_RE = re.compile(r"[^\x00-\x7F]")
# Drop format/marketing/level noise
_OL_DROP_PREFIX_RE = re.compile(
    r"^(reading level|large type|nyt:|new york times (reviewed|bestseller list))",
    re.IGNORECASE,
)
# Common non-English particles that indicate a foreign-language subject heading
_OL_FOREIGN_WORDS_RE = re.compile(
    r"\b(romans?|nouvelles?|pour la|juvenil|ficción|jeunesse|roman à|"
    r"para jovens?|pour les?|geschichte|voor)\b",
    re.IGNORECASE,
)


def _word_title_case(s: str) -> str:
    """Title-case by space-splitting only, so apostrophes don't get capitalised."""
    return " ".join(w[0].upper() + w[1:].lower() if w else w for w in s.split(" "))


def _normalize_ol_subjects(subjects: list[str]) -> list[str]:
    """Filter and normalize raw OpenLibrary subjects into clean genre tags.

    Special case: ``genre:X`` prefixes (e.g. ``genre:fantasy``) are extracted
    and treated as plain tags before the general metadata-prefix filter, because
    OL's structured genre tags are high-signal.

    Drops: other metadata-prefixed tags (award:, age:, Serie:, form:, etc.),
    hierarchy paths (-> or --), URL strings, underscore-joined identifiers,
    reading-level and format-noise tags, foreign-language headings (any
    non-ASCII char or known foreign particles), and anything over
    _OL_MAX_TAG_LEN characters.  Title-cases survivors so case variants
    collapse during the later canonicalization step.
    """
    out = []
    for s in subjects:
        # Extract genre: prefix values before the general metadata filter.
        m = re.match(r"^genre:(.+)", s, re.IGNORECASE)
        if m:
            s = m.group(1).replace("-", " ").strip()
        elif _OL_METADATA_PREFIX_RE.match(s):
            continue
        if "->" in s or " -- " in s:
            continue
        if "http" in s:
            continue
        if "_" in s:
            continue
        if len(s) > _OL_MAX_TAG_LEN:
            continue
        if _OL_DROP_PREFIX_RE.match(s):
            continue
        if _OL_NON_ASCII_RE.search(s):
            continue
        if _OL_FOREIGN_WORDS_RE.search(s):
            continue
        out.append(_word_title_case(s))
    return out


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
            merged["description"] = screen_text(
                entry["description"], label=merged.get("title", "")
            )
        if entry.get("cover") and not merged.get("cover"):
            merged["cover"] = entry["cover"]
        enriched.append(merged)
    return enriched


def _dedup_genres(genres: list[str]) -> list[str]:
    """Order-preserving, case-insensitive dedup."""
    seen: set[str] = set()
    out = []
    for g in genres:
        key = g.lower()
        if key not in seen:
            seen.add(key)
            out.append(g)
    return out


# Maps any normalized/lowercased tag → a canonical genre label.
# Tags not present here are dropped from the final genres field so only
# controlled-vocabulary labels reach the site.
_GENRE_ONTOLOGY: dict[str, str] = {
    # --- broad containers ---
    "nonfiction": "Nonfiction",
    "juvenile nonfiction": "Nonfiction",
    # --- Fantasy ---
    "fantasy": "Fantasy",
    "fantasy fiction": "Fantasy",
    "fantasy & magic": "Fantasy",
    "fiction, fantasy, general": "Fantasy",
    "fiction, fantasy, historical": "Fantasy",
    "juvenile fiction / fantasy & magic": "Fantasy",
    "children's fantasy fiction": "Fantasy",
    "english fantasy literature": "Fantasy",
    "science fiction, fantasy, & magic": "Fantasy",
    "magic": "Fantasy",
    "magic, fiction": "Fantasy",
    "wizards": "Fantasy",
    "wizards, fiction": "Fantasy",
    "witches": "Fantasy",
    "witches, fiction": "Fantasy",
    "fairies": "Fantasy",
    "fairies, fiction": "Fantasy",
    "elves": "Fantasy",
    "fairy tales": "Fantasy",
    "mythical creatures": "Fantasy",
    "mythical animals": "Fantasy",
    "labyrinths": "Fantasy",
    "imaginary places": "Fantasy",
    "magia": "Fantasy",
    # --- Science Fiction ---
    "science fiction": "Science Fiction",
    "sci-fi": "Science Fiction",
    "science fiction.": "Science Fiction",
    "science-fiction": "Science Fiction",
    "fiction, science fiction, general": "Science Fiction",
    "fiction, science fiction, action & adventure": "Science Fiction",
    "fiction, science fiction, hard science fiction": "Science Fiction",
    "fiction / science fiction / general": "Science Fiction",
    "fiction / science fiction / hard science fiction": "Science Fiction",
    "juvenile fiction / science fiction": "Science Fiction",
    "american science fiction": "Science Fiction",
    "science fiction & fantasy": "Science Fiction",
    "lgbtq science fiction & fantasy": "Science Fiction",
    "teen science fiction": "Science Fiction",
    "young adult fiction / science fiction": "Science Fiction",
    "space and time": "Science Fiction",
    "space and time, fiction": "Science Fiction",
    "life on other planets": "Science Fiction",
    "extraterrestrial beings": "Science Fiction",
    "extraterrestrial beings, fiction": "Science Fiction",
    "genetic engineering": "Science Fiction",
    "space colonies": "Science Fiction",
    "human-alien encounters": "Science Fiction",
    "speculative fiction": "Science Fiction",
    "time travel": "Science Fiction",
    "time travel, fiction": "Science Fiction",
    # --- Dystopian ---
    "dystopias": "Dystopian",
    "dystopian": "Dystopian",
    "dystopia": "Dystopian",
    "dystopian fiction": "Dystopian",
    "fiction, dystopian": "Dystopian",
    # --- Mystery & Thriller ---
    "mystery and detective stories": "Mystery & Thriller",
    "mystery": "Mystery & Thriller",
    "mystery fiction": "Mystery & Thriller",
    "detective and mystery stories": "Mystery & Thriller",
    "english detective and mystery stories": "Mystery & Thriller",
    "mysteries & detective stories": "Mystery & Thriller",
    "juvenile fiction / mysteries & detective stories": "Mystery & Thriller",
    "thriller": "Mystery & Thriller",
    "suspense fiction": "Mystery & Thriller",
    "crime": "Mystery & Thriller",
    "crime, fiction": "Mystery & Thriller",
    "crime fiction": "Mystery & Thriller",
    "murder": "Mystery & Thriller",
    "murder, fiction": "Mystery & Thriller",
    "detective work": "Mystery & Thriller",
    "kidnapping": "Mystery & Thriller",
    "kidnapping, fiction": "Mystery & Thriller",
    "criminals": "Mystery & Thriller",
    "criminals, fiction": "Mystery & Thriller",
    "missing persons": "Mystery & Thriller",
    "missing persons, fiction": "Mystery & Thriller",
    # --- Spy & Espionage ---
    "spies": "Spy & Espionage",
    "spies, fiction": "Spy & Espionage",
    "spy stories": "Spy & Espionage",
    "english spy stories": "Spy & Espionage",
    "spies in fiction": "Spy & Espionage",
    "espionage": "Spy & Espionage",
    "intelligence service": "Spy & Espionage",
    "code and cipher stories": "Spy & Espionage",
    "ciphers": "Spy & Espionage",
    "cryptography": "Spy & Espionage",
    "secret societies": "Spy & Espionage",
    # --- Horror ---
    "horror stories": "Horror",
    "horror tales": "Horror",
    "horror": "Horror",
    # --- Paranormal ---
    "vampires": "Paranormal",
    "vampires, fiction": "Paranormal",
    "werewolves": "Paranormal",
    "werewolves, fiction": "Paranormal",
    "supernatural": "Paranormal",
    "supernatural, fiction": "Paranormal",
    "paranormal fiction": "Paranormal",
    "paranormal": "Paranormal",
    "monsters": "Paranormal",
    "monsters, fiction": "Paranormal",
    "demonology": "Paranormal",
    # --- Historical Fiction ---
    "historical fiction": "Historical Fiction",
    "fiction, alternative history": "Historical Fiction",
    # --- Adventure ---
    "adventure and adventurers, fiction": "Adventure",
    "adventure and adventurers": "Adventure",
    "adventure stories": "Adventure",
    "adventure fiction": "Adventure",
    "action & adventure": "Adventure",
    "adventure": "Adventure",
    "adventure and adventurers in fiction": "Adventure",
    "juvenile fiction / action & adventure / general": "Adventure",
    "juvenile fiction / action & adventure": "Adventure",
    "fiction, action & adventure": "Adventure",
    "fiction / action & adventure": "Adventure",
    "pirates": "Adventure",
    "pirates, fiction": "Adventure",
    "quests (expeditions)": "Adventure",
    "survival": "Adventure",
    "survival, fiction": "Adventure",
    "survival stories": "Adventure",
    "survival skills": "Adventure",
    "heroes": "Adventure",
    "heroes, fiction": "Adventure",
    "superheroes": "Adventure",
    # --- Romance ---
    "romance": "Romance",
    "romance fiction": "Romance",
    "love stories": "Romance",
    "love & romance": "Romance",
    "love": "Romance",
    "love, fiction": "Romance",
    "man-woman relationships": "Romance",
    "man-woman relationships, fiction": "Romance",
    "juvenile fiction / love & romance": "Romance",
    # --- Mythology ---
    "mythology": "Mythology",
    "greek mythology": "Mythology",
    "egyptian mythology": "Mythology",
    "legends, myths, fables": "Mythology",
    "gods and goddesses": "Mythology",
    "greek gods": "Mythology",
    # --- Coming of Age ---
    "bildungsromans": "Coming of Age",
    "coming of age": "Coming of Age",
    "fiction, coming of age": "Coming of Age",
    "fiction / coming of age": "Coming of Age",
    # --- Humor ---
    "humorous stories": "Humor",
    "humorous fiction": "Humor",
    "humor": "Humor",
    "fiction, satire": "Humor",
    # --- Literary Fiction ---
    "fiction / literary": "Literary Fiction",
    "literary": "Literary Fiction",
    # --- Classics ---
    "classics": "Classics",
    # --- Short Stories ---
    "short stories": "Short Stories",
    "fiction, short stories (single author)": "Short Stories",
    # --- Graphic Novel ---
    "comics & graphic novels": "Graphic Novel",
    "graphic novels": "Graphic Novel",
    "comic books, strips": "Graphic Novel",
    # --- Poetry ---
    "poetry": "Poetry",
    # --- Essays ---
    "essays": "Essays",
    "essay": "Essays",
    "literary criticism": "Essays",
    # --- Memoir & Biography ---
    "biography & autobiography": "Memoir & Biography",
    "biography": "Memoir & Biography",
    "autobiography": "Memoir & Biography",
    "personal memoirs": "Memoir & Biography",
    "biography & autobiography / personal memoirs": "Memoir & Biography",
    "biographies": "Memoir & Biography",
    # --- History ---
    "history": "History",
    "history and criticism": "History",
    "economic history": "History",
    # --- Philosophy ---
    "philosophy": "Philosophy",
    "ethics": "Philosophy",
    "existentialism": "Philosophy",
    "modern philosophy": "Philosophy",
    # --- Psychology ---
    "psychology": "Psychology",
    "social psychology": "Psychology",
    "psychological fiction": "Psychology",
    "fiction, psychological": "Psychology",
    "identity (psychology)": "Psychology",
    # --- Self-Help ---
    "self-help": "Self-Help",
    "self help": "Self-Help",
    "self-actualization (psychology)": "Self-Help",
    "health & fitness": "Self-Help",
    "self-help techniques": "Self-Help",
    # --- Science & Nature ---
    "science": "Science & Nature",
    "biology": "Science & Nature",
    "evolution": "Science & Nature",
    "animal behavior": "Science & Nature",
    "mathematics": "Science & Nature",
    "medicine": "Science & Nature",
    "nature": "Science & Nature",
    # --- Politics & Society ---
    "social science": "Politics & Society",
    "sociology": "Politics & Society",
    "politics": "Politics & Society",
    "political science": "Politics & Society",
    "feminism": "Politics & Society",
    "politics and government": "Politics & Society",
    "civil rights": "Politics & Society",
    "war": "Politics & Society",
    "war, fiction": "Politics & Society",
    "war stories": "Politics & Society",
    "terrorism": "Politics & Society",
    "terrorism, fiction": "Politics & Society",
    "political corruption": "Politics & Society",
    "political fiction": "Politics & Society",
    "fiction, political": "Politics & Society",
    # --- Business & Economics ---
    "business & economics": "Business & Economics",
    "business": "Business & Economics",
    "economics": "Business & Economics",
    "game theory": "Business & Economics",
    "decision making": "Business & Economics",
    "leadership": "Business & Economics",
    # --- Technology ---
    "technology": "Technology",
    "computers": "Technology",
    "internet": "Technology",
    "computer hackers": "Technology",
    "hackers": "Technology",
    "virtual reality": "Technology",
    "virtual reality, fiction": "Technology",
    "artificial intelligence": "Technology",
    "information technology": "Technology",
    # --- Young Adult ---
    "young adult fiction": "Young Adult",
    "young adult": "Young Adult",
    "teen fiction": "Young Adult",
    "teenagers": "Young Adult",
    "teenage boys": "Young Adult",
    "teenage girls": "Young Adult",
    "american young adult fiction": "Young Adult",
    "young adult works": "Young Adult",
}


def _canonicalize_genres(genres: list[str]) -> list[str]:
    """Map a list of raw/normalized genre tags to canonical labels, dropping unknowns.

    Lowercases each tag before lookup so Google Books Title Case, OL title-cased
    subjects, and any other variants all hit the same keys.  The output list is
    deduplicated and in insertion order.
    """
    seen: set[str] = set()
    out = []
    for g in genres:
        canonical = _GENRE_ONTOLOGY.get(g.lower())
        if canonical and canonical not in seen:
            seen.add(canonical)
            out.append(canonical)
    return out


def enrich_books_with_openlibrary_subjects(
    books: list[dict], enrich: bool = False
) -> list[dict]:
    """Augment the ``genres`` field on each book with OpenLibrary subject tags.

    Uses the batch ``/api/books?bibkeys=`` endpoint (chunks of _OL_CHUNK_SIZE ISBNs)
    so the run makes far fewer requests than one-per-book.  Requires no API key.
    Books without an ISBN are skipped (title|author is not a valid bibkey).
    Cache: INPUT_DATA_DIR/openlibrary-subjects-cache.json, keyed by ISBN.
    Cached ``null`` means no subjects found; not re-fetched unless enrich=True.
    OpenLibrary subjects are profanity-screened before merge.
    """
    cache_path = os.path.join(config.INPUT_DATA_DIR, OPENLIBRARY_SUBJECTS_CACHE_FILENAME)
    cache: dict = {}
    if os.path.exists(cache_path):
        with open(cache_path, encoding="utf-8") as f:
            cache = json.load(f)

    # Collect uncached ISBNs.
    to_fetch: list[tuple[str, str]] = []  # (isbn, cache_key)
    for book in books:
        isbn = book.get("isbn13") or book.get("isbn") or ""
        if not isbn:
            continue
        key = isbn
        if key in cache:
            if not enrich:
                continue
            if cache[key]:  # non-empty list means already enriched
                continue
        to_fetch.append((isbn, key))

    newly_fetched = 0
    # Batch fetch in chunks.
    for i in range(0, len(to_fetch), _OL_CHUNK_SIZE):
        chunk = to_fetch[i : i + _OL_CHUNK_SIZE]
        bibkeys = ",".join(f"ISBN:{isbn}" for isbn, _ in chunk)
        try:
            resp = requests.get(
                OPENLIBRARY_BOOKS_API,
                params={"bibkeys": bibkeys, "format": "json", "jscmd": "data"},
                headers={"User-Agent": _OL_USER_AGENT, "Accept": "application/json"},
                timeout=15,
            )
            resp.raise_for_status()
            data = resp.json()
            for isbn, key in chunk:
                entry = data.get(f"ISBN:{isbn}", {})
                raw_subjects = entry.get("subjects", [])
                subjects = []
                for s in raw_subjects:
                    if isinstance(s, dict):
                        subjects.append(s.get("name", ""))
                    elif isinstance(s, str):
                        subjects.append(s)
                subjects = [s for s in subjects if s]
                cache[key] = subjects if subjects else None
                newly_fetched += 1
        except Exception as exc:
            logging.warning(f"OpenLibrary: batch fetch failed for chunk {i}: {exc}")
            for _, key in chunk:
                if key not in cache:
                    cache[key] = None
                newly_fetched += 1
        sleep(random.uniform(0.05, 0.2))

    if newly_fetched:
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(cache, f, indent=4, ensure_ascii=False)
        logging.info(
            f"OpenLibrary: fetched {newly_fetched} ISBN lookups, {len(cache)} total in cache"
        )

    unmapped: dict[str, int] = {}
    enriched = []
    for book in books:
        isbn = book.get("isbn13") or book.get("isbn") or ""
        cached = cache.get(isbn) if isbn else None
        existing = book.get("genres") or []
        if not cached:
            enriched.append({**book, "genres": _canonicalize_genres(existing)})
            continue
        normalized = _normalize_ol_subjects(cached)
        screened = screen_tags(normalized, label=book.get("title", ""))
        for tag in screened:
            if tag.lower() not in _GENRE_ONTOLOGY:
                unmapped[tag] = unmapped.get(tag, 0) + 1
        merged = {**book, "genres": _canonicalize_genres(existing + screened)}
        enriched.append(merged)

    if unmapped:
        top = sorted(unmapped.items(), key=lambda x: x[1], reverse=True)[:15]
        logging.debug(
            "OpenLibrary: top unmapped subjects (add to _GENRE_ONTOLOGY to capture): "
            + ", ".join(f"{t!r}×{n}" for t, n in top)
        )
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
            books = enrich_goodreads_with_google_books(books, api_key, enrich=enrich)
            data[shelf_key] = enrich_books_with_openlibrary_subjects(
                books, enrich=enrich
            )

    if enrich and latest_csv_date:
        intake.set_enrich_date("books_api", latest_csv_date)

    io.save_formatted_data("media/books", data)
