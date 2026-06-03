from __future__ import annotations

import html
import re


def _strip_html(text: str) -> str:
    return re.sub(r"<[^>]+>", "", html.unescape(text or "")).strip()
