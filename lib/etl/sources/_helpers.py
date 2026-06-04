from __future__ import annotations

import html
import re


def _strip_html(text: str) -> str:
    text = re.sub(r"<br\s*/?>", "\n", html.unescape(text or ""), flags=re.IGNORECASE)
    return re.sub(r"<[^>]+>", "", text).strip()
