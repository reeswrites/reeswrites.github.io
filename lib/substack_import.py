"""Import a Substack post into `_posts/` as a Jekyll markdown post.

Substack keeps the whole post body in the server-rendered HTML, so a plain GET is
enough — no API key, no auth.  The body is converted to markdown and the media
embeds (YouTube, TikTok, Spotify, SoundCloud, other Substack posts) are resolved
back into ordinary links with real titles, since an iframe is useless in a
markdown post.

    pipenv run substack https://reeswrites.substack.com/p/some-post
"""

from __future__ import annotations

import argparse
import json
import os
import re
import urllib.parse
from datetime import datetime

import frontmatter
import requests
from bs4 import BeautifulSoup, NavigableString, Tag

post_directory = "_posts"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    )
}

# Spotify only server-renders its og: tags for simple clients — a browser
# User-Agent gets the JS shell, which has no title or artist in it.
SIMPLE_HEADERS = {"User-Agent": "curl/8.7.1"}

# Substack page furniture that carries no post content.
CHROME_SELECTORS = [
    "svg",
    "button",
    "form",
    "div.subscription-widget-wrap",
    "div.image-link-expand",
    "div.header-anchor-parent",
    "div.button-wrapper",
]

# Embed poster art and provider avatars, sized by Substack's CDN. The link that
# replaces the embed says everything the thumbnail did.
EMBED_THUMB_WIDTHS = ("w_56", "w_640")

# Page <title>s that describe the site rather than the thing linked to.
GENERIC_TITLE = re.compile(
    r"^(?:|YouTube|TikTok.*|Spotify\s*[–-]\s*Web Player.*"
    r"|Before you continue to YouTube.*)$",
    re.IGNORECASE,
)

MD_LINK_RE = re.compile(r"(?<!!)\[([^\]]*)\]\((https?://[^)]+)\)")

# Media tags implied by the title of each weekly series.
SERIES_TAGS = [
    (re.compile(r"\bread\b", re.I), "Books"),
    (re.compile(r"\blisten(ed)?\b", re.I), "Music/Vinyl"),
    (re.compile(r"\bwatch(ed)?\b", re.I), "Film"),
]

_session = requests.Session()
_soundcloud_client_id: list[str] = []


# ──────────────────────────────────────────────────────────────────────────────
# fetching
# ──────────────────────────────────────────────────────────────────────────────
def fetch_text(url: str, headers: dict | None = None) -> str:
    """GET a page and return its body, or "" if it cannot be reached."""
    try:
        resp = _session.get(url, timeout=20, headers=headers or HEADERS)
        resp.raise_for_status()

        return resp.text
    except Exception as exc:
        print(f"Failed to fetch '{url}': {exc}")

        return ""


def fetch_json(url: str) -> dict:
    try:
        resp = _session.get(url, timeout=20, headers=HEADERS)
        resp.raise_for_status()

        return resp.json()
    except Exception as exc:
        print(f"Failed to fetch '{url}': {exc}")

        return {}


def oembed(endpoint: str, target: str, **params) -> dict:
    query = {"url": target, **params}

    return fetch_json(f"{endpoint}?{urllib.parse.urlencode(query)}")


# ──────────────────────────────────────────────────────────────────────────────
# media embeds → links
# ──────────────────────────────────────────────────────────────────────────────
def soundcloud_client_id() -> str:
    """Scrape the public client_id SoundCloud's own web player uses."""
    if _soundcloud_client_id:
        return _soundcloud_client_id[0]

    client_id = ""
    home = fetch_text("https://soundcloud.com/")
    scripts = re.findall(r'src="(https://[^"]*sndcdn\.com/assets/[^"]+\.js)"', home)

    for script_url in reversed(scripts):
        match = re.search(
            r"""client_id[=:"']{1,3}([A-Za-z0-9]{32})""", fetch_text(script_url)
        )
        if match:
            client_id = match.group(1)
            break

    _soundcloud_client_id.append(client_id)

    return client_id


def soundcloud_track(track_id: str) -> dict:
    """Resolve an api.soundcloud.com track id to its public permalink."""
    client_id = soundcloud_client_id()
    if not client_id:
        return {}

    return fetch_json(
        f"https://api-v2.soundcloud.com/tracks/{track_id}?client_id={client_id}"
    )


def _youtube_label(url: str) -> tuple[str, str]:
    data = oembed("https://www.youtube.com/oembed", url, format="json")
    title, author = data.get("title"), data.get("author_name")

    return " — ".join(x for x in [title, author] if x) or "Watch on YouTube", url


def _tiktok_label(url: str) -> tuple[str, str]:
    data = oembed("https://www.tiktok.com/oembed", url)

    title = re.sub(r"#\w+", "", data.get("title") or "")
    title = re.sub(r"\s+", " ", title).strip(" -–—")
    if len(title) > 90:
        title = title[:87].rstrip() + "…"

    handle = data.get("author_name")
    if not handle:
        match = re.match(r"https://www\.tiktok\.com/@([^/]+)/", url)
        handle = match.group(1) if match else ""

    label = " — ".join(x for x in [title, f"@{handle}" if handle else ""] if x)

    return label or "Watch on TikTok", url


def _spotify_label(url: str) -> tuple[str, str]:
    canonical = re.sub(r"open\.spotify\.com/embed/", "open.spotify.com/", url)
    canonical = canonical.split("?")[0]

    title = artist = ""
    page = fetch_text(canonical, headers=SIMPLE_HEADERS)
    if page:
        soup = BeautifulSoup(page, "html.parser")
        og_title = soup.find("meta", property="og:title")
        og_desc = soup.find("meta", property="og:description")
        if og_title:
            title = re.sub(
                r"\s*-\s*(Album|Single|EP|song and lyrics).*$",
                "",
                og_title.get("content", ""),
            )
            title = re.sub(r"\s*\|\s*Spotify\s*$", "", title).strip()
        if og_desc:
            # "Ecco2k · PXE · Song · 2021"
            artist = og_desc.get("content", "").split("·")[0].strip()

    if not title:
        title = oembed("https://open.spotify.com/oembed", canonical).get("title", "")

    label = " — ".join(x for x in [title, artist] if x)

    return label or "Listen on Spotify", canonical


def _soundcloud_label(url: str) -> tuple[str, str]:
    query = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
    target = urllib.parse.unquote(query.get("url", [url])[0])

    data = oembed("https://soundcloud.com/oembed", target, format="json")
    title = re.sub(r"\s+by\s+[^|]+$", "", data.get("title") or "").strip()
    author = data.get("author_name") or ""
    permalink = ""

    track_id = re.search(r"/tracks/(\d+)", target)
    if track_id:
        track = soundcloud_track(track_id.group(1))
        permalink = track.get("permalink_url") or ""
        title = track.get("title") or title
        author = (track.get("user") or {}).get("username") or author

    label = " — ".join(x for x in [title, author] if x)

    return label or "Listen on SoundCloud", (permalink or target)


def describe_media(url: str) -> tuple[str, str]:
    """Return (link label, canonical url) for an embedded media URL."""
    if "youtube.com" in url or "youtu.be" in url:
        return _youtube_label(url)
    if "tiktok.com" in url:
        return _tiktok_label(url)
    if "spotify.com" in url:
        return _spotify_label(url)
    if "soundcloud.com" in url:
        return _soundcloud_label(url)

    return "", url


def _iframe_target(src: str) -> str:
    """Unwrap the real URL out of an iframely (or similar) player URL."""
    query = urllib.parse.parse_qs(urllib.parse.urlparse(src).query)
    if "iframely" in src or "soundcloud" in src:
        return urllib.parse.unquote(query.get("url", [""])[0]) or src

    return src


# ──────────────────────────────────────────────────────────────────────────────
# html → markdown
# ──────────────────────────────────────────────────────────────────────────────
def _escape_label(text: str) -> str:
    """Square brackets inside a link label break the markdown link."""
    return text.replace("[", "\\[").replace("]", "\\]")


def _data_attrs(tag: Tag) -> dict:
    raw = tag.get("data-attrs")
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        return {}


def _image_markdown(tag: Tag) -> str:
    attrs = _data_attrs(tag)
    original = attrs.get("src") or tag.get("src", "")
    src = (
        tag.get("src", "")
        if original.lower().endswith((".heic", ".heif"))
        else original
    )

    alt = (tag.get("alt") or "").strip()
    if re.search(r"stock (image|photo)|shutterstock", alt, re.I):
        alt = ""

    return f"![{alt}]({src})" if src else ""


def _inline(node) -> str:
    """Render inline content (text, links, emphasis) to markdown."""
    if isinstance(node, NavigableString):
        return str(node).replace("\xa0", " ")

    if not isinstance(node, Tag):
        return ""

    inner = "".join(_inline(child) for child in node.children)

    if node.name == "a":
        stripped = inner.strip()
        lead = inner[: len(inner) - len(inner.lstrip())]
        trail = inner[len(inner.rstrip()) :]

        return f"{lead}[{_escape_label(stripped)}]({node.get('href', '')}){trail}"
    if node.name in ("strong", "b"):
        return f"**{inner}**"
    if node.name in ("em", "i"):
        return f"_{inner}_"
    if node.name == "code":
        return f"`{inner}`"
    if node.name == "br":
        return "  \n"
    if node.name == "img":
        return _image_markdown(node)

    return inner


def _text_block(node) -> str:
    return re.sub(r"[ \t]+", " ", _inline(node)).strip()


def _list_blocks(list_tag: Tag, indent: str) -> list[str]:
    """Render a <ul>/<ol>, indenting nested content under the item marker."""
    blocks: list[str] = []
    ordered = list_tag.name == "ol"

    for number, item in enumerate(list_tag.find_all("li", recursive=False), start=1):
        marker = f"{number}. " if ordered else "- "
        child_indent = indent + " " * len(marker)
        first = True

        for block in _blocks(item, child_indent):
            stripped = (
                block[len(child_indent) :] if block.startswith(child_indent) else block
            )
            blocks.append((indent + marker + stripped) if first else block)
            first = False

        if first:  # <li> with bare text and no block child
            text = _text_block(item)
            if text:
                blocks.append(indent + marker + text)

    return blocks


def _blocks(node: Tag, indent: str = "") -> list[str]:
    """Walk a container element and render its children as markdown blocks."""
    blocks: list[str] = []

    for child in node.children:
        if isinstance(child, NavigableString):
            continue
        if not isinstance(child, Tag):
            continue

        name = child.name

        if name == "p":
            text = _text_block(child)
            if text:
                blocks.append(indent + text)
        elif name in ("h1", "h2", "h3", "h4", "h5", "h6"):
            text = _text_block(child).replace("**", "")
            if text:
                blocks.append(indent + "#" * int(name[1]) + " " + text)
        elif name in ("ul", "ol"):
            blocks.extend(_list_blocks(child, indent))
        elif name == "blockquote":
            blocks.extend(indent + "> " + b.lstrip() for b in _blocks(child))
        elif name == "hr":
            blocks.append(indent + "---")
        elif name == "img":
            image = _image_markdown(child)
            if image:
                blocks.append(indent + image)
        elif name == "pre":
            blocks.append(indent + "```\n" + child.get_text().strip() + "\n```")
        else:
            blocks.extend(_blocks(child, indent))

    return blocks


def _replace_with_link(tag: Tag, soup: BeautifulSoup, label: str, url: str) -> None:
    paragraph = soup.new_tag("p")
    anchor = soup.new_tag("a", href=url)
    anchor.string = label
    paragraph.append(anchor)
    tag.replace_with(paragraph)


def _resolve_embeds(soup: BeautifulSoup) -> None:
    """Swap Substack's embed widgets for plain links with real titles."""
    for card in soup.select("div.embedded-post-wrap"):
        attrs = _data_attrs(card)
        url = (attrs.get("url") or "").split("?")[0]
        title = attrs.get("title") or "Substack post"
        publication = attrs.get("publication_name") or ""
        bylines = ", ".join(
            b.get("name", "") for b in (attrs.get("bylines") or []) if b.get("name")
        )
        credit = " — ".join(dict.fromkeys(x for x in [publication, bylines] if x))
        label = " — ".join(x for x in [title, credit] if x)

        if url:
            _replace_with_link(card, soup, label, url)
        else:
            card.decompose()

    for wrap in soup.select("div.youtube-wrap"):
        video_id = _data_attrs(wrap).get("videoId")
        if not video_id:
            iframe = wrap.find("iframe")
            match = re.search(
                r"embed/([A-Za-z0-9_-]{6,})", iframe.get("src", "") if iframe else ""
            )
            video_id = match.group(1) if match else ""

        if not video_id:
            wrap.decompose()
            continue

        url = f"https://www.youtube.com/watch?v={video_id}"
        label, url = describe_media(url)
        _replace_with_link(wrap, soup, label, url)

    for iframe in soup.find_all("iframe"):
        target = _iframe_target(iframe.get("src", ""))
        label, url = describe_media(target) if target else ("", "")

        if label:
            _replace_with_link(iframe, soup, label, url)
        else:
            iframe.decompose()


def _strip_chrome(soup: BeautifulSoup) -> None:
    for selector in CHROME_SELECTORS:
        for tag in soup.select(selector):
            tag.decompose()

    for image in soup.find_all("img"):
        src = image.get("src", "")
        if "substackcdn.com//img/" in src or (
            "substackcdn.com/image/fetch/" in src
            and any(f",{w}," in src for w in EMBED_THUMB_WIDTHS)
        ):
            image.decompose()


def parse_post(html: str) -> dict:
    """Pull title, description, publish time, and markdown body out of a post page."""
    soup = BeautifulSoup(html, "html.parser")

    def meta(**attrs) -> str:
        tag = soup.find("meta", attrs=attrs)

        return tag.get("content", "").strip() if tag else ""

    title = meta(property="og:title")
    description = meta(name="description") or meta(property="og:description")

    time_tag = soup.find("time")
    published_at = time_tag.get("datetime", "") if time_tag else ""

    body = soup.select_one("div.body.markup")
    if body is None:
        raise ValueError("No post body found — is this a Substack post page?")

    _strip_chrome(body)
    _resolve_embeds(body)

    markdown = "\n\n".join(_blocks(body))
    markdown = re.sub(r"\n{3,}", "\n\n", markdown).strip()

    return {
        "title": title,
        "description": description,
        "published_at": published_at,
        "body": markdown,
    }


# ──────────────────────────────────────────────────────────────────────────────
# post assembly
# ──────────────────────────────────────────────────────────────────────────────
def slugify(title: str) -> str:
    slug = title.lower().replace(".", "-")
    slug = re.sub(r"[^a-z0-9]+", "-", slug)

    return slug.strip("-")


def filename_for(title: str, published: datetime) -> str:
    name = re.sub(r"[^A-Za-z0-9.]+", "-", title).strip("-")

    return f"{published:%Y-%m-%d}-{name}.md"


def default_tags(title: str, published: datetime) -> list[str]:
    tags = [tag for pattern, tag in SERIES_TAGS if pattern.search(title)]
    tags += ["Favorite Media", "Weekly Media", f"{published:%Y}"]

    return tags


def backfill_link_titles(links: dict, body: str) -> dict:
    """Use the body's own link text where a site refuses to give us a <title>."""
    labels = {
        url: text.replace("\\[", "[").replace("\\]", "]")
        for text, url in MD_LINK_RE.findall(body)
    }

    for link in links.get("external", []):
        if GENERIC_TITLE.match(link.get("title", "")) and labels.get(link["url"]):
            link["title"] = labels[link["url"]]

    return links


def build_post(
    url: str, tags: list[str] | None = None, post_type: str = "list"
) -> frontmatter.Post:
    """Fetch a Substack post and return it as a frontmatter.Post ready to write."""
    parsed = parse_post(fetch_text(url))
    published = datetime.fromisoformat(parsed["published_at"].replace("Z", "+00:00"))
    published = published.astimezone()

    return frontmatter.Post(
        parsed["body"],
        layout="post",
        type=post_type,
        tags=tags or default_tags(parsed["title"], published),
        title=parsed["title"],
        slug=slugify(parsed["title"]),
        description=parsed["description"],
        publish_datetime=published.isoformat(),
    )


def import_substack(args: argparse.Namespace):
    """CLI entry point: write one Substack post into _posts/."""
    post = build_post(args.url, tags=args.tags, post_type=args.type)
    published = datetime.fromisoformat(post["publish_datetime"])
    file_path = os.path.join(
        args.dest or post_directory, filename_for(post["title"], published)
    )

    if args.dry_run:
        print(frontmatter.dumps(post))

        return

    # imported here so a dry run does not need the rest of the post toolchain
    from jekyll_tools import extract_links

    with open(file_path, "w", encoding="utf-8") as f:
        f.write(frontmatter.dumps(post))

    # links need the post on disk: extract_links reads the file the same way enrich does
    post["links"] = backfill_link_titles(extract_links(file_path), post.content)

    with open(file_path, "w", encoding="utf-8") as f:
        f.write(frontmatter.dumps(post))

    print(f"Wrote {file_path}")
