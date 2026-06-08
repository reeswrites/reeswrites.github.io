"""Output helpers — write JSON to the output directory and optionally copy it elsewhere."""

from __future__ import annotations

import json
import logging
import os
import shutil
from datetime import datetime

from . import config


def save_formatted_data(source_name: str, file_data: dict) -> None:
    """
    Save formatted source data as JSON to OUTPUT_DATA_DIR.
    If config.OUTPUT_DEST is set, also copies the file there.
    """
    file_data["last_updated"] = datetime.today().strftime("%Y-%m-%d")

    out_path = os.path.join(config.OUTPUT_DATA_DIR, f"{source_name}.json")
    with open(out_path, "w", encoding="utf8") as f:
        f.write(json.dumps(file_data, indent=4, ensure_ascii=False))

    if config.OUTPUT_DEST:
        shutil.copy2(out_path, os.path.join(config.OUTPUT_DEST, f"{source_name}.json"))
        logging.info(f"Copied {source_name}.json to {config.OUTPUT_DEST}")
