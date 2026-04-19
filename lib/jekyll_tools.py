import argparse
import os
import re
from datetime import datetime
from pathlib import Path

# oyaml is a drop-in replacement for PyYAML which preserves dict ordering
# import before everything so python-frontmatter uses oyaml
import oyaml as yaml
import frontmatter

import requests
from bs4 import BeautifulSoup

# from cli import prompt
from git_tools import get_publish_date

draft_directory = "_drafts"
post_directory = "_posts"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    )
}


def prompt(message):
    response = input(message)

    if response.strip() == "":
        print("Response cannot be empty. Please try again.")

        return prompt(message)

    return response


def create_draft(args: argparse.Namespace):
    title = args.title or prompt("Title: ")
    slug = args.slug or title.lower().replace(" ", "-")

    filename = title.replace(" ", "-") + ".md"
    file_path = os.path.join(draft_directory, filename)
    if os.path.isfile(file_path):
        print(
            f"Draft with filename '{filename}' already exists. Please choose a different title."
        )

        return create_draft()

    with open(file_path, "w") as f:
        f.write(
            frontmatter.dumps(
                frontmatter.Post(
                    layout="post",
                    type="stub",
                    tags=[],
                    title=title,
                    slug=slug,
                    description="",
                )
            )
        )


def extract_links(post_filepath: str) -> dict:
    """
    Parse a Jekyll post and return internal and external links.

    Args:
        post_filepath: Path to the Jekyll post .md file

    Returns:
        dict with keys 'internal' and 'external', each a list of
        {'url': ..., 'title': ...} dicts.
    """
    post_filepath = Path(post_filepath)
    posts_dir = post_filepath.parent  # assumes siblings live in the same _posts/ dir

    with open(post_filepath, "r", encoding="utf-8") as f:
        content = f.read()

    # Match ALL markdown links: [text](target)
    # target is either a normal URL or a Jekyll {% post_url slug %} tag
    md_link_re = re.compile(r"\[(?P<text>[^\]]*)\]\((?P<target>[^)]+)\)")

    internal_links = []
    external_links = []

    for match in md_link_re.finditer(content):
        target = match.group("target").strip()

        # ── Internal: {% post_url some-slug %} ──────────────────────────────
        post_url_re = re.match(
            r"\{%\s*post_url\s+(?P<post_file_name>\S+)\s*%\}", target
        )
        if post_url_re:
            post_file_name = post_url_re.group("post_file_name")
            candidate = posts_dir / f"{post_file_name}.md"

            title = ""
            slug = ""

            try:
                linked_post = frontmatter.load(str(candidate))
                title = linked_post.get("title", "")
                slug = linked_post.get("slug", "")
            except Exception as exc:
                print(
                    "Dead post_url reference '%s' in %s: %s",
                    post_file_name,
                    post_filepath,
                    exc,
                )
            internal_links.append({"url": f"/posts/{slug}", "title": title})

        # ── External: normal http(s) URL ────────────────────────────────────
        elif target.startswith("http://") or target.startswith("https://"):
            title = ""
            try:
                resp = requests.get(target, timeout=10, headers=HEADERS)
                resp.raise_for_status()

                soup = BeautifulSoup(resp.text, "html.parser")
                title_tag = soup.find("title")
                title = title_tag.get_text(strip=True) if title_tag else ""
            except Exception as exc:
                print(
                    "Failed to fetch external URL '%s' in %s: %s",
                    target,
                    post_filepath,
                    exc,
                )
            external_links.append({"url": target, "title": title})

    return {"internal": internal_links, "external": external_links}


def enrich_frontmatter(args: argparse.Namespace):
    # inspired by: https://landscapearchaeology.org/2019/frontmatter/
    for file_name in os.listdir(post_directory):
        # get file path to post within post directory
        file_path = os.path.join(post_directory, file_name)

        # check if object is nested subfolder, if so, skip
        if not os.path.isfile(file_path):
            continue

        # load post with python-frontmatter
        post = frontmatter.load(file_path)

        # get post year from file name
        post_date_start_index = file_path.rindex("/") + 1
        post_year = file_path[post_date_start_index : post_date_start_index + 4]

        # add post year as tag if not already present
        if post_year not in post.metadata["tags"]:
            post.metadata["tags"].append(post_year)

        # add publish datetime to frontmatter if not already present
        if "publish_datetime" not in post.metadata:
            post.metadata["publish_datetime"] = get_publish_date(file_path)

        # add links to frontmatter if not already present
        if "links" not in post.metadata:
            post.metadata["links"] = extract_links(file_path)

        # write post back to file with updated frontmatter
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(frontmatter.dumps(post))


def promote_draft(args: argparse.Namespace):
    # print all drafts with their titles and prompt user to select one by number
    for i, file_name in enumerate(os.listdir(draft_directory)):
        file_path = os.path.join(draft_directory, file_name)

        if os.path.isfile(file_path):
            draft = frontmatter.load(file_path)

            print(f"{i + 1}. {draft['title']}")

    # prompt user to select draft by number and validate input
    choice = int(prompt("Enter your choice: "))
    if choice < 1 or choice > len(os.listdir(draft_directory)):
        print("Invalid choice. Please try again.")

        return promote_draft()

    # get publish date as ISO string and rename draft file to post file path to promote draft to post
    publish_date = datetime.today().strftime("%Y-%m-%d")
    draft_file_path = os.path.join(
        draft_directory, list(os.listdir(draft_directory))[choice - 1]
    )
    post_file_path = os.path.join(
        post_directory, publish_date + "-" + draft_file_path.split("/")[-1]
    )

    print(f"Promoting draft '{draft_file_path}' to post '{post_file_path}'...")

    # check if post file path already exists
    if os.path.isfile(post_file_path):
        print(f"Post with filename '{post_file_path}' already exists.")

        return promote_draft()

    # rename draft file to post file path to promote draft to post
    os.rename(draft_file_path, post_file_path)
