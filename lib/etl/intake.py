"""File discovery and loaders — find the latest export for a source and load it."""

from __future__ import annotations

import csv
import glob
import json
import os
from datetime import date, datetime

from openpyxl import load_workbook

from . import config

_ENRICH_STATE_FILENAME = "enrich-state.json"


def get_files_by_source(source_name: str) -> list[str]:
    """Get a list of filenames/dirs in INPUT_DATA_DIR that belong to a source."""
    return [
        file_name
        for file_name in os.listdir(config.INPUT_DATA_DIR)
        if file_name.startswith(source_name)
    ]


def get_source_file_date(file_name: str) -> datetime.date:
    """Parse the date from a source filename or directory name (format: <source>-YYYY-MM-DD[.ext])."""
    tokens = file_name.split("-")
    date_string = os.path.splitext("-".join(tokens[1:]))[0]
    return datetime.strptime(date_string, config.FILE_DATE_FORMAT).date()


def get_latest_data_file(file_list: list[str]) -> str:
    """Return the filename with the most recent date from a list of <source>-YYYY-MM-DD files."""
    if not file_list:
        raise ValueError("Cannot have empty file list.")
    latest = file_list[0]
    for file_name in file_list:
        if get_source_file_date(file_name) > get_source_file_date(latest):
            latest = file_name
    return latest


def get_data_from_file(file_name: str) -> str:
    """Read raw text from a file in INPUT_DATA_DIR."""
    with open(os.path.join(config.INPUT_DATA_DIR, file_name), encoding="utf8") as f:
        return f.read()


def _latest_filename(source_name: str) -> str:
    candidates = []
    for f in get_files_by_source(source_name):
        try:
            get_source_file_date(f)
            candidates.append(f)
        except ValueError:
            continue
    return get_latest_data_file(candidates)


def load_latest(source_name: str):
    """Load the latest file for a source, dispatching on extension.

    Returns list[dict] for .csv, a Workbook for .xlsx, and str for everything else.
    """
    filename = _latest_filename(source_name)
    ext = os.path.splitext(filename)[1].lower()
    if ext == ".csv":
        return list(csv.DictReader(get_data_from_file(filename).splitlines()))
    if ext == ".xlsx":
        return load_workbook(os.path.join(config.INPUT_DATA_DIR, filename))
    return get_data_from_file(filename)


def find_in_dir(directory: str, pattern: str) -> str:
    """Return the first file matching glob pattern inside directory, or raise."""
    matches = glob.glob(os.path.join(directory, pattern))
    if not matches:
        raise FileNotFoundError(f"No file matching {pattern!r} in {directory}")
    return matches[0]


def list_dated_exports(source_name: str, ext: str = ".csv") -> list[str]:
    """List files matching exactly <source>-YYYY-MM-DD<ext> (excludes *-cache.json etc.)."""
    result = []
    prefix = source_name + "-"
    for filename in os.listdir(config.INPUT_DATA_DIR):
        if not filename.startswith(prefix):
            continue
        if not filename.endswith(ext):
            continue
        stem = filename[len(prefix) : -len(ext)]
        try:
            datetime.strptime(stem, config.FILE_DATE_FORMAT)
            result.append(filename)
        except ValueError:
            continue
    return result


def latest_export_date(source_name: str, ext: str = ".csv") -> date | None:
    """Return the date of the latest dated export file, or None if none exist."""
    files = list_dated_exports(source_name, ext)
    if not files:
        return None
    return get_source_file_date(get_latest_data_file(files))


def get_enrich_date(source: str) -> date | None:
    """Return the last enrich date for a source from enrich-state.json, or None."""
    path = os.path.join(config.INPUT_DATA_DIR, _ENRICH_STATE_FILENAME)
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as f:
        state = json.load(f)
    raw = state.get(source)
    if not raw:
        return None
    return datetime.strptime(raw, config.FILE_DATE_FORMAT).date()


def set_enrich_date(source: str, d: date) -> None:
    """Record the enrich date for a source in enrich-state.json."""
    path = os.path.join(config.INPUT_DATA_DIR, _ENRICH_STATE_FILENAME)
    state: dict = {}
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            state = json.load(f)
    state[source] = d.isoformat()
    with open(path, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=4, ensure_ascii=False)
