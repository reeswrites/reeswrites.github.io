from __future__ import annotations

# Path constants and runtime globals.
#
# IMPORTANT: always reference these via attribute access on the module (config.X),
# never via "from etl.config import X".  The CLI mutates OUTPUT_DEST and
# SITE_ROOT at runtime, and tests monkeypatch INPUT_DATA_DIR / OUTPUT_DATA_DIR —
# both only work when callers read through the module object.

INPUT_DATA_DIR: str = "./input"
OUTPUT_DATA_DIR: str = "./_data"
FILE_DATE_FORMAT: str = "%Y-%m-%d"

OUTPUT_DEST: str | None = None
SITE_ROOT: str = "."
FORCE_ENRICH: bool = False
