from __future__ import annotations

import json
import logging
import os

import requests

from .. import config, io

GITHUB_API_ROOT = "https://api.github.com"
GITHUB_CACHE_FILENAME = "github-cache.json"
EXCLUDED_REPOS: frozenset[str] = frozenset({"reeshuffled/reeshuffled.github.io"})


def _github_username() -> str:
    return os.environ.get("GITHUB_USERNAME", "reeshuffled")


def fetch_github_pushes(username: str | None = None) -> list[dict]:
    """Fetch PushEvents from GitHub public API, return flat list of push records.

    Maintains INPUT_DATA_DIR/github-cache.json for incremental updates.
    Deduplicates by push_id. Excludes repos in EXCLUDED_REPOS.

    Note: GitHub's public events API no longer includes the commits array or
    size field in PushEvent payloads, so we track pushes rather than commits.
    """
    username = username or _github_username()

    cache_path = os.path.join(config.INPUT_DATA_DIR, GITHUB_CACHE_FILENAME)
    if os.path.exists(cache_path):
        with open(cache_path, encoding="utf-8") as f:
            cache = json.load(f)
        cached_pushes: list[dict] = cache.get("pushes", [])
    else:
        cached_pushes = []

    seen_ids: set[str] = {str(p["push_id"]) for p in cached_pushes if "push_id" in p}

    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "personal-site-etl/1.0",
    }
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"

    new_pushes: list[dict] = []
    page = 1
    while page <= 10:
        url = f"{GITHUB_API_ROOT}/users/{username}/events?per_page=100&page={page}"
        resp = requests.get(url, headers=headers)
        if resp.status_code == 404:
            logging.error("GitHub user not found: %s", username)
            break
        resp.raise_for_status()

        events = resp.json()
        if not events:
            break

        for event in events:
            if event.get("type") != "PushEvent":
                continue
            repo_name = event.get("repo", {}).get("name", "")
            if repo_name in EXCLUDED_REPOS:
                continue
            push_id = str(event.get("payload", {}).get("push_id", ""))
            if not push_id or push_id in seen_ids:
                continue
            seen_ids.add(push_id)
            new_pushes.append(
                {
                    "push_id": push_id,
                    "repo": repo_name,
                    "date": event.get("created_at", "")[:10],
                    "head": event.get("payload", {}).get("head", ""),
                    "ref": event.get("payload", {}).get("ref", ""),
                }
            )

        if 'rel="next"' not in resp.headers.get("Link", ""):
            break
        page += 1

    all_pushes = new_pushes + cached_pushes

    with open(cache_path, "w", encoding="utf-8") as f:
        json.dump({"pushes": all_pushes}, f, indent=4, ensure_ascii=False)

    logging.info("GitHub: %d new pushes, %d total", len(new_pushes), len(all_pushes))
    return all_pushes


def get_github_activity() -> None:
    """ETL entry point: fetch GitHub pushes and save aggregated counts to _data/github_activity.json."""
    from collections import defaultdict

    pushes = fetch_github_pushes()
    by_date_repo: dict[tuple[str, str], int] = defaultdict(int)
    for p in pushes:
        date, repo = p.get("date", ""), p.get("repo", "")
        if date and repo:
            by_date_repo[(date, repo)] += 1

    activity = [
        {"date": date, "repo": repo, "count": count}
        for (date, repo), count in sorted(by_date_repo.items(), key=lambda kv: kv[0][0], reverse=True)
    ]
    io.save_formatted_data("github_activity", {"activity": activity})
