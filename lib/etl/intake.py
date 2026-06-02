"""File discovery and loaders — find the latest export for a source and load it."""
from __future__ import annotations

import csv
import glob
import os
from datetime import datetime

from openpyxl import load_workbook

from . import config


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
    return get_latest_data_file(get_files_by_source(source_name))


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


def load_latest_lastfm(source_name: str) -> list[dict]:
    """Load a headerless Last.fm CSV, injecting fieldnames explicitly."""
    return list(csv.DictReader(
        get_data_from_file(_latest_filename(source_name)).splitlines(),
        fieldnames=["artist", "album", "song", "scrobbled_at"],
    ))


def find_in_dir(directory: str, pattern: str) -> str:
    """Return the first file matching glob pattern inside directory, or raise."""
    matches = glob.glob(os.path.join(directory, pattern))
    if not matches:
        raise FileNotFoundError(f"No file matching {pattern!r} in {directory}")
    return matches[0]
