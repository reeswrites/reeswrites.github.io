"""Cross-source ownership link step.

Reads the already-generated media and inventory JSON files, computes ownership
matches, and bakes an ``owned`` dict onto each consumed media record.  Also
writes a matching ``anchor`` field onto owned inventory items so inventory pages
can render per-item deep-link targets (``id="{{ item.anchor }}"``) that the
``owned.url`` fragment points to.

Matching is strict (normalised exact match + ±1-year tolerance for movies/tv)
to favour precision over recall — a wrong "Owned" badge is worse than a
missing one.

**Run order:** must execute after all media + inventory sources because it reads
and mutates their output files.  Re-running a single media source alone (e.g.
``prepare movies_api``) overwrites its JSON and drops the ``owned`` flags until
``prepare ownership`` (or a full ``prepare``) is run again.
"""

from __future__ import annotations

import json
import logging
import os
import re
import unicodedata

from .. import config, io
from .google import (
    _clean_dvd_title,
)  # strips format suffix: "Inception (Blu-ray)" → "Inception"

# --------------------------------------------------------------------------- #
# Normalisation                                                                  #
# --------------------------------------------------------------------------- #

# Strips bracketed tokens — e.g. "[Blu-ray]", "(4K)", "(Special Edition)",
# "(500)" — so that both sides of the join use the bare title/name.
_BRACKET_RE = re.compile(r"\s*[\[\(][^\]\)]*[\]\)]")

# Matches the format token for *display* extraction (before normalising).
_DVD_FORMAT_RE = re.compile(
    r"[\[\(](4K\s*Ultra\s*HD|Blu[- ]?[Rr]ay|DVD|UHD)[\]\)]",
    re.IGNORECASE,
)


def _normalize(s: str) -> str:
    """Lowercase, strip diacritics, strip bracketed tokens, strip punctuation,
    collapse whitespace.  Both sides of every join go through this function so
    formatting differences don't prevent a valid match.
    """
    s = str(s or "")
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = s.lower()
    s = _BRACKET_RE.sub("", s)
    s = re.sub(r"[^\w\s]", "", s)
    return re.sub(r"\s+", " ", s).strip()


def _parse_dvd_format(raw_title: str) -> str:
    """Return a human-readable format label parsed from the raw DVD title."""
    m = _DVD_FORMAT_RE.search(raw_title)
    if not m:
        return "DVD"
    token = m.group(1).strip()
    if re.match(r"blu.?ray", token, re.IGNORECASE):
        return "Blu-ray"
    if re.match(r"4k", token, re.IGNORECASE) or token.upper() == "UHD":
        return "4K Ultra HD"
    return "DVD"


def _slugify(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


# --------------------------------------------------------------------------- #
# Anchor generation                                                               #
# --------------------------------------------------------------------------- #


def _dvd_anchor(dvd: dict) -> str:
    """Stable anchor for a DVD record, preferring the EAN/UPC barcode."""
    ean = str(dvd.get("ean_isbn13") or dvd.get("upc_isbn10") or "").strip()
    if ean:
        return f"dvd-{ean}"
    cleaned = _normalize(_clean_dvd_title(dvd.get("title", "")))
    return f"dvd-{_slugify(cleaned)}" if cleaned else "dvd-unknown"


def _record_anchor(record: dict) -> str:
    artist = _slugify(_normalize(record.get("artist_name", "")))
    album = _slugify(_normalize(record.get("album_name", "")))
    return f"record-{artist}-{album}"


# --------------------------------------------------------------------------- #
# File helpers                                                                    #
# --------------------------------------------------------------------------- #


def _load_json(name: str) -> dict:
    path = os.path.join(config.OUTPUT_DATA_DIR, f"{name}.json")
    if not os.path.exists(path):
        logging.warning("ownership: %s.json not found, skipping", name)
        return {}
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _save(name: str, data: dict) -> None:
    # Ensure the subdirectory exists (tests use a tmp_path that may not have it).
    out_path = os.path.join(config.OUTPUT_DATA_DIR, f"{name}.json")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    # Strip the stale last_updated so save_formatted_data injects today's date.
    io.save_formatted_data(name, {k: v for k, v in data.items() if k != "last_updated"})


# --------------------------------------------------------------------------- #
# Per-type index builders + annotators                                           #
# --------------------------------------------------------------------------- #


def _build_dvd_index(dvds: list[dict]) -> dict[str, list[dict]]:
    """Normalised-title → list-of-candidates.

    Year-based filtering (±1) is done at lookup time; we therefore group only
    by title so a single query can consider multiple years for the same film.
    Each DVD record gets an ``anchor`` field stamped in-place.
    """
    index: dict[str, list[dict]] = {}
    for dvd in dvds:
        cleaned = _clean_dvd_title(dvd.get("title", ""))
        norm_title = _normalize(cleaned)
        if not norm_title:
            continue
        anchor = _dvd_anchor(dvd)
        dvd["anchor"] = anchor
        index.setdefault(norm_title, []).append(
            {
                "dvd": dvd,
                "anchor": anchor,
                "year": str(dvd.get("publish_date", "")).strip(),
            }
        )
    return index


def _dvd_owned_obj(dvd: dict, anchor: str) -> dict:
    return {
        "format": _parse_dvd_format(dvd.get("title", "")),
        "source": "Libib",
        "url": f"/inventory/dvds#{anchor}",
    }


def _link_to_dvds(
    items: list[dict], title_key: str, year_key: str, dvd_index: dict
) -> None:
    """Shared annotator for movies and TV shows."""
    for item in items:
        norm_name = _normalize(item.get(title_key, ""))
        if not norm_name:
            continue
        candidates = dvd_index.get(norm_name, [])
        if not candidates:
            continue
        try:
            item_year = int(str(item.get(year_key, "") or ""))
        except ValueError:
            item_year = None
        for cand in candidates:
            try:
                dvd_year = int(cand["year"])
            except ValueError:
                dvd_year = None
            # Accept when both years are present and within ±1, or when
            # either year is missing (strict text match already strong enough).
            if item_year is None or dvd_year is None or abs(item_year - dvd_year) <= 1:
                item["owned"] = _dvd_owned_obj(cand["dvd"], cand["anchor"])
                break


def _link_books(read_books: list[dict], owned_books: list[dict]) -> None:
    """Self-join: mark read books that also appear on the owned shelf."""
    isbn_index: dict[str, dict] = {}
    text_index: dict[str, dict] = {}
    for b in owned_books:
        for key in (b.get("isbn", "").strip(), b.get("isbn13", "").strip()):
            if key:
                isbn_index[key] = b
        text_key = f"{_normalize(b.get('title', ''))}|{_normalize(b.get('author', ''))}"
        if text_key not in ("|", ""):
            text_index[text_key] = b

    for book in read_books:
        isbn = book.get("isbn", "").strip()
        isbn13 = book.get("isbn13", "").strip()
        text_key = (
            f"{_normalize(book.get('title', ''))}|{_normalize(book.get('author', ''))}"
        )
        matched = (
            isbn_index.get(isbn) or isbn_index.get(isbn13) or text_index.get(text_key)
        )
        if matched:
            book["owned"] = {
                "format": "Book",
                "source": "Goodreads",
                "url": "/inventory/books-owned",
            }


def _build_record_index(records: list[dict]) -> dict[str, list[dict]]:
    """Artist+album → list-of-candidates.  Also stamps ``anchor`` in-place."""
    index: dict[str, list[dict]] = {}
    for r in records:
        anchor = _record_anchor(r)
        r["anchor"] = anchor
        norm_artist = _normalize(r.get("artist_name", ""))
        norm_album = _normalize(r.get("album_name", ""))
        key = f"{norm_artist}|{norm_album}"
        if key not in ("|", ""):
            index.setdefault(key, []).append({"record": r, "anchor": anchor})
    return index


def _link_music_to_records(scrobbles: list[dict], record_index: dict) -> None:
    """Annotate scrobbles whose artist+album matches a vinyl record."""
    for scrobble in scrobbles:
        key = (
            f"{_normalize(scrobble.get('artist', ''))}"
            f"|{_normalize(scrobble.get('album', ''))}"
        )
        if key in ("|", ""):
            continue
        candidates = record_index.get(key, [])
        if candidates:
            anchor = candidates[0]["anchor"]
            scrobble["owned"] = {
                "format": "Vinyl",
                "source": "Discogs",
                "url": f"/inventory/records#{anchor}",
            }


# --------------------------------------------------------------------------- #
# Reverse annotators (consumption data → inventory items)                        #
# --------------------------------------------------------------------------- #


def _link_movies_to_dvds_reverse(movies: list[dict], dvds: list[dict]) -> None:
    """Stamp watch data (rating, date, letterboxd_uri) onto matched DVDs."""
    # Build movie lookup: norm_title → list of {movie, year} candidates.
    movie_index: dict[str, list[dict]] = {}
    for movie in movies:
        norm_name = _normalize(movie.get("name", ""))
        if norm_name:
            movie_index.setdefault(norm_name, []).append(
                {"movie": movie, "year": str(movie.get("year", "")).strip()}
            )

    for dvd in dvds:
        cleaned = _clean_dvd_title(dvd.get("title", ""))
        norm_title = _normalize(cleaned)
        if not norm_title:
            continue
        candidates = movie_index.get(norm_title, [])
        if not candidates:
            continue
        try:
            dvd_year = int(str(dvd.get("publish_date", "") or ""))
        except ValueError:
            dvd_year = None
        for cand in candidates:
            try:
                movie_year = int(cand["year"])
            except ValueError:
                movie_year = None
            if (
                dvd_year is None
                or movie_year is None
                or abs(dvd_year - movie_year) <= 1
            ):
                m = cand["movie"]
                dvd["watched"] = {
                    "rating": m.get("rating"),
                    "date": m.get("date"),
                    "letterboxd_uri": m.get("letterboxd_uri"),
                    "name": m.get("name"),
                    "year": m.get("year"),
                    "tmdb_id": m.get("tmdb_id"),
                }
                break


def _link_records_to_scrobbles_reverse(
    records: list[dict], scrobbles: list[dict]
) -> None:
    """Stamp total scrobble count onto matched vinyl records."""
    # Aggregate per-album play counts from the per-song scrobble list.
    totals: dict[str, int] = {}
    for scrobble in scrobbles:
        key = (
            f"{_normalize(scrobble.get('artist', ''))}"
            f"|{_normalize(scrobble.get('album', ''))}"
        )
        if key not in ("|", ""):
            totals[key] = totals.get(key, 0) + int(scrobble.get("scrobbles", 0))

    for record in records:
        norm_artist = _normalize(record.get("artist_name", ""))
        norm_album = _normalize(record.get("album_name", ""))
        key = f"{norm_artist}|{norm_album}"
        if key in ("|", ""):
            continue
        count = totals.get(key)
        if count:
            record["listened"] = {"scrobbles": count}


def _link_owned_books_to_read_reverse(
    owned_books: list[dict], read_books: list[dict]
) -> None:
    """Stamp read data (rating, date) onto owned books that have been read."""
    # Build read-book lookup (mirrors _link_books forward logic).
    isbn_index: dict[str, dict] = {}
    text_index: dict[str, dict] = {}
    for b in read_books:
        for key in (b.get("isbn", "").strip(), b.get("isbn13", "").strip()):
            if key:
                isbn_index[key] = b
        text_key = f"{_normalize(b.get('title', ''))}|{_normalize(b.get('author', ''))}"
        if text_key not in ("|", ""):
            text_index[text_key] = b

    for book in owned_books:
        isbn = book.get("isbn", "").strip()
        isbn13 = book.get("isbn13", "").strip()
        text_key = (
            f"{_normalize(book.get('title', ''))}|{_normalize(book.get('author', ''))}"
        )
        matched = (
            isbn_index.get(isbn) or isbn_index.get(isbn13) or text_index.get(text_key)
        )
        if matched:
            book["read"] = {
                "rating": matched.get("my_rating"),
                "date": matched.get("date"),
            }


# --------------------------------------------------------------------------- #
# Main entry point                                                                #
# --------------------------------------------------------------------------- #


def link_ownership() -> None:
    """Cross-source ownership annotation (both directions).

    Forward: stamps ``owned`` onto consumed media (movies, books, scrobbles).
    Reverse: stamps consumption data onto inventory items (DVDs, records, owned books).
    """
    movies_data = _load_json("media/movies")
    tv_data = _load_json("media/tv")
    books_data = _load_json("media/books")
    music_data = _load_json("media/music")
    dvds_data = _load_json("media/dvds")
    records_data = _load_json("inventory/records")

    movies = movies_data.get("watched", [])
    shows = tv_data.get("shows", [])
    read_books = books_data.get("read", [])
    owned_books = books_data.get("owned", [])
    scrobbles = music_data.get("scrobbles", [])
    dvds = dvds_data.get("dvds", [])
    records = records_data.get("owned", [])

    # Build indexes (also stamps anchor onto each owned inventory item).
    dvd_index = _build_dvd_index(dvds)
    record_index = _build_record_index(records)

    # Forward: annotate consumed media with ownership info.
    _link_to_dvds(movies, "name", "year", dvd_index)
    _link_to_dvds(shows, "title", "year", dvd_index)
    _link_books(read_books, owned_books)
    _link_music_to_records(scrobbles, record_index)

    # Reverse: annotate inventory items with consumption data.
    _link_movies_to_dvds_reverse(movies, dvds)
    _link_records_to_scrobbles_reverse(records, scrobbles)
    _link_owned_books_to_read_reverse(owned_books, read_books)

    movie_owned = sum(1 for m in movies if m.get("owned"))
    show_owned = sum(1 for s in shows if s.get("owned"))
    book_owned = sum(1 for b in read_books if b.get("owned"))
    scrobble_owned = sum(1 for s in scrobbles if s.get("owned"))
    dvd_watched = sum(1 for d in dvds if d.get("watched"))
    record_listened = sum(1 for r in records if r.get("listened"))
    owned_book_read = sum(1 for b in owned_books if b.get("read"))
    logging.info(
        "ownership: %d movies, %d TV shows, %d books, %d scrobbles annotated "
        "(reverse: %d DVDs watched, %d records listened, %d owned books read)",
        movie_owned,
        show_owned,
        book_owned,
        scrobble_owned,
        dvd_watched,
        record_listened,
        owned_book_read,
    )

    # Write back all mutated files (only when the source file existed).
    if movies_data:
        movies_data["watched"] = movies
        _save("media/movies", movies_data)
    if tv_data:
        tv_data["shows"] = shows
        _save("media/tv", tv_data)
    if books_data:
        books_data["read"] = read_books
        books_data["owned"] = owned_books
        _save("media/books", books_data)
    if music_data:
        music_data["scrobbles"] = scrobbles
        _save("media/music", music_data)
    if dvds_data:
        dvds_data["dvds"] = dvds
        _save("media/dvds", dvds_data)
    if records_data:
        records_data["owned"] = records
        _save("inventory/records", records_data)
