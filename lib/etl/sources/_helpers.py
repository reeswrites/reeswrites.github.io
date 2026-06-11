from __future__ import annotations

import html
import logging
import re

from profanity_check import predict_prob

PROFANITY_THRESHOLD = 0.7


def _strip_html(text: str) -> str:
    text = re.sub(r"<br\s*/?>", "\n", html.unescape(text or ""), flags=re.IGNORECASE)
    return re.sub(r"<[^>]+>", "", text).strip()


def screen_text(text: str | None, label: str = "") -> str | None:
    """Return text if clean; None (and log warning) if predict_prob > PROFANITY_THRESHOLD."""
    if not text:
        return text
    score = float(predict_prob([text])[0])
    if score > PROFANITY_THRESHOLD:
        logging.warning(f"Profanity screen: dropped {label!r} (score={score:.2f})")
        return None
    return text


def screen_tags(tags: list[str], label: str = "") -> list[str]:
    """Drop any tag scoring above PROFANITY_THRESHOLD; batch predict for efficiency."""
    if not tags:
        return tags
    scores = predict_prob(tags)
    kept = []
    for tag, score in zip(tags, scores):
        if float(score) > PROFANITY_THRESHOLD:
            logging.warning(
                f"Profanity screen: dropped tag {tag!r} from {label!r} (score={float(score):.2f})"
            )
        else:
            kept.append(tag)
    return kept
