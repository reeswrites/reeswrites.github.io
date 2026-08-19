from __future__ import annotations

import os

# Path constants and runtime globals.
#
# IMPORTANT: always reference these via attribute access on the module (config.X),
# never via "from etl.config import X".  The CLI mutates OUTPUT_DEST and
# SITE_ROOT at runtime, and tests monkeypatch INPUT_DATA_DIR / OUTPUT_DATA_DIR —
# both only work when callers read through the module object.

# Colocated into the Exo record (one place, ADR-0001): this repo reads/writes its
# input side FROM the instance now. Renamed from `warehouse` when Exo's engine was
# split out into its own public repo; EXO_HOME is the variable the engine's own
# tooling honours. Tests still monkeypatch this. Was "./input".
INPUT_DATA_DIR: str = os.environ.get(
    "EXO_EXPORTS",
    os.path.join(os.environ.get("EXO_HOME", "/Users/rees/Documents/exo-me"),
                 "raw", "reeshuffled-input"))
OUTPUT_DATA_DIR: str = "./_data"
FILE_DATE_FORMAT: str = "%Y-%m-%d"

OUTPUT_DEST: str | None = None
SITE_ROOT: str = "."
FORCE_ENRICH: bool = False
