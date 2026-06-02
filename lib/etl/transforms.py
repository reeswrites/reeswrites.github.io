"""Pure transform utilities — no filesystem I/O, no config dependency."""
from __future__ import annotations

from datetime import datetime


# ---------------------------------------------------------------------------
# Generic field-level utilities
# ---------------------------------------------------------------------------

def drop_fields(data: list[dict], fields: tuple | list) -> list[dict]:
    """Drop listed fields from every dict in data (missing keys are silently skipped)."""
    for entry in data:
        for field_name in fields:
            entry.pop(field_name, None)
    return data


def convert_to_snake_case(name: str) -> str:
    """Convert a string to snake_case."""
    return "_".join(name.lower().replace("-", " ").split(" "))


def group_by(data: list[dict], key: str) -> dict[str, list]:
    """Group a list of dicts by the value at key."""
    grouped: dict[str, list] = {}
    for value in data:
        grouped.setdefault(value[key], []).append(value)
    return grouped


def left_join_by(data1: list[dict], data2: list[dict], join_keys: list[str]) -> list[dict]:
    """Left-join data1 with data2 on join_keys; unmatched left rows pass through unchanged."""
    result = []
    for entry1 in data1:
        matched = False
        for entry2 in data2:
            if all(entry1[k] == entry2[k] for k in join_keys):
                result.append({**entry1, **entry2})
                matched = True
        if not matched:
            result.append(entry1)
    return result


def filter_key_by_list(data: list[dict], key: str, filter_list: tuple | list) -> list[dict]:
    """Remove entries whose value at key appears in filter_list."""
    return [entry for entry in data if entry[key] not in filter_list]


def map_fields(data: list[dict], field_mapping: dict[str, str]) -> list[dict]:
    """Rename keys in every dict according to field_mapping."""
    for entry in data:
        for old_key, new_key in field_mapping.items():
            if old_key in entry:
                entry[new_key] = entry.pop(old_key)
    return data


def excel_to_dict(sheet) -> list[dict]:
    """Convert an openpyxl worksheet to a list of dicts with snake_case headers."""
    headers = [
        "_".join(cell.value.lower().split(" ")) if isinstance(cell.value, str) else cell.value
        for cell in sheet[1]
    ]
    data = []
    for row_index in range(2, sheet.max_row + 1):
        row_dict = {
            headers[col - 1]: sheet.cell(row=row_index, column=col).value
            for col in range(1, len(headers) + 1)
        }
        data.append(row_dict)
    return data


# ---------------------------------------------------------------------------
# Date helpers (used by apple_health source)
# ---------------------------------------------------------------------------

def get_date_from_datetime(date_time: str) -> str:
    """Parse a datetime string and return the date portion as YYYY-MM-DD."""
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M"):
        try:
            return datetime.strptime(date_time, fmt).date().isoformat()
        except ValueError:
            pass
    raise ValueError(f"Unrecognized date format: {date_time!r}")


def upsert_data(old: list[dict], new: list[dict], pk: str) -> list[dict]:
    """Append items from new whose pk is not already in old (insert-if-not-exists)."""
    existing_keys = {item[pk] for item in old}
    return list(old) + [item for item in new if item[pk] not in existing_keys]
