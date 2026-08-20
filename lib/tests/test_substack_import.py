"""Tests for the Substack post importer."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from lib import substack_import


def _page(body: str, published: str = "2026-08-09T23:34:21.681Z") -> str:
    return f"""
    <html><head>
      <meta property="og:title" content="What I Read the Week of 2026.08.02"/>
      <meta name="description" content="Read and liked!"/>
    </head><body>
      <div class="post-header"><time datetime="{published}">Aug 9</time></div>
      <div class="available-content">
        <div dir="auto" class="body markup">{body}</div>
      </div>
    </body></html>
    """


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    """Nothing in these tests may reach out to the network."""

    def _fail(*args, **kwargs):
        raise AssertionError(f"unexpected network call: {args}")

    monkeypatch.setattr(substack_import, "fetch_text", _fail)
    monkeypatch.setattr(substack_import, "fetch_json", _fail)
    monkeypatch.setattr(
        substack_import,
        "describe_media",
        lambda url: ("Resolved Title — Author", url),
    )


def test_headings_and_nested_lists_keep_their_shape():
    body = """
      <h2 class="header-anchor-post"><strong>Movies</strong>
        <div class="pencraft header-anchor-parent"><button>x</button></div>
      </h2>
      <ol><li><p><a href="https://letterboxd.com/film/x/">Fiume o Morte!</a> (2025)</p>
        <ul><li><p>A documentary.</p></li><li><p>Wes Andersonian.</p></li></ul>
      </li>
      <li><p>Second film</p></li></ol>
    """

    markdown = substack_import.parse_post(_page(body))["body"]

    assert markdown.splitlines() == [
        "## Movies",
        "",
        "1. [Fiume o Morte!](https://letterboxd.com/film/x/) (2025)",
        "",
        "   - A documentary.",
        "",
        "   - Wes Andersonian.",
        "",
        "2. Second film",
    ]


def test_metadata_comes_from_the_page_head_and_time_tag():
    parsed = substack_import.parse_post(_page("<p>Hi</p>"))

    assert parsed["title"] == "What I Read the Week of 2026.08.02"
    assert parsed["description"] == "Read and liked!"
    assert parsed["published_at"] == "2026-08-09T23:34:21.681Z"


def test_missing_body_is_an_error():
    with pytest.raises(ValueError):
        substack_import.parse_post("<html><body><p>not a post</p></body></html>")


def test_images_prefer_the_original_but_keep_cdn_copies_for_heic():
    body = """
      <figure><img src="https://substackcdn.com/image/fetch/$s,w_1456,f_auto/x.heic"
        data-attrs='{"src": "https://substack-post-media.s3.amazonaws.com/a.heic"}'
        alt="Old Man Sitting at Home Reading Stock Image"/></figure>
      <figure><img src="https://substackcdn.com/image/fetch/$s,w_1456,f_auto/y.jpeg"
        data-attrs='{"src": "https://substack-post-media.s3.amazonaws.com/b.jpeg"}'
        alt="A photo"/></figure>
    """

    markdown = substack_import.parse_post(_page(body))["body"]

    # .heic does not render in browsers, so the CDN's f_auto copy wins there
    assert (
        "![](https://substackcdn.com/image/fetch/$s,w_1456,f_auto/x.heic)" in markdown
    )
    assert "![A photo](https://substack-post-media.s3.amazonaws.com/b.jpeg)" in markdown


def test_chrome_and_embed_thumbnails_are_dropped():
    body = """
      <p>Kept</p>
      <div class="subscription-widget-wrap"><p>Subscribe now</p></div>
      <form action="/api/v1/free"><input/></form>
      <img src="https://substackcdn.com/image/fetch/$s,w_640,f_auto/poster.jpeg"/>
      <img src="https://substackcdn.com//img/alert-circle.svg"/>
    """

    markdown = substack_import.parse_post(_page(body))["body"]

    assert markdown == "Kept"


def test_substack_cards_become_links_with_credit():
    body = """
      <div class="embedded-post-wrap" data-attrs='{"url": "https://example.substack.com/p/x?utm=1",
        "title": "The Dark Night of Mathematics",
        "publication_name": "Ossuary Lost at Sea",
        "bylines": [{"name": "Kirwin Hampshire"}]}'>
        <div class="embedded-post-body">preview</div>
      </div>
    """

    markdown = substack_import.parse_post(_page(body))["body"]

    assert markdown == (
        "[The Dark Night of Mathematics — Ossuary Lost at Sea — Kirwin Hampshire]"
        "(https://example.substack.com/p/x)"
    )


def test_substack_card_credit_is_not_repeated_when_author_is_the_publication():
    body = """
      <div class="embedded-post-wrap" data-attrs='{"url": "https://jake.substack.com/p/x",
        "title": "Talking to Strangers", "publication_name": "Jake Gloudemans",
        "bylines": [{"name": "Jake Gloudemans"}]}'></div>
    """

    markdown = substack_import.parse_post(_page(body))["body"]

    assert (
        markdown
        == "[Talking to Strangers — Jake Gloudemans](https://jake.substack.com/p/x)"
    )


def test_youtube_and_iframe_embeds_become_resolved_links():
    body = """
      <div class="youtube-wrap" data-attrs='{"videoId": "e1cg0jPrBDw"}'>
        <div class="youtube-inner"><iframe src="https://www.youtube-nocookie.com/embed/e1cg0jPrBDw?rel=0"></iframe></div>
      </div>
      <iframe class="tiktok-iframe" src="https://iframely.net/api/iframe?url=https%3A%2F%2Fwww.tiktok.com%2F%40kiki%2Fvideo%2F7671029342163438868&amp;key=abc"></iframe>
    """

    markdown = substack_import.parse_post(_page(body))["body"]

    assert markdown.splitlines() == [
        "[Resolved Title — Author](https://www.youtube.com/watch?v=e1cg0jPrBDw)",
        "",
        "[Resolved Title — Author](https://www.tiktok.com/@kiki/video/7671029342163438868)",
    ]


def test_blockquotes_and_inline_emphasis_survive():
    body = """
      <blockquote><p>A great essay on <em>aesthetics</em>.</p></blockquote>
      <p>Read <strong>this</strong> by <a href="https://chia.design/">Chia</a>.</p>
    """

    markdown = substack_import.parse_post(_page(body))["body"]

    assert markdown.splitlines() == [
        "> A great essay on _aesthetics_.",
        "",
        "Read **this** by [Chia](https://chia.design/).",
    ]


def test_link_labels_escape_square_brackets(monkeypatch):
    monkeypatch.setattr(
        substack_import,
        "describe_media",
        lambda url: ("MIDWXST - TWIN SISTERS [PROD : Deadmarni]", url),
    )
    body = """<iframe src="https://w.soundcloud.com/player/?url=https%3A%2F%2Fapi.soundcloud.com%2Ftracks%2F1"></iframe>"""

    markdown = substack_import.parse_post(_page(body))["body"]

    assert markdown.startswith("[MIDWXST - TWIN SISTERS \\[PROD : Deadmarni\\]](")


def test_trailing_space_inside_a_link_moves_outside_it():
    body = """<p><a href="https://brennan.day/x/">Five Indie Platforms </a>(RSS)</p>"""

    markdown = substack_import.parse_post(_page(body))["body"]

    assert markdown == "[Five Indie Platforms](https://brennan.day/x/) (RSS)"


def test_slugify_and_filename_use_the_publish_date():
    published = datetime(2026, 8, 9, 19, 34, tzinfo=timezone(timedelta(hours=-4)))
    title = "What I Read the Week of 2026.08.02"

    assert substack_import.slugify(title) == "what-i-read-the-week-of-2026-08-02"
    assert (
        substack_import.filename_for(title, published)
        == "2026-08-09-What-I-Read-the-Week-of-2026.08.02.md"
    )


@pytest.mark.parametrize(
    "title,expected",
    [
        ("What I Read the Week of 2026.08.02", "Books"),
        ("Stuff I Listened to the Week of 2026.08.02", "Music/Vinyl"),
        ("Things I Watched the Week of 2026.08.02", "Film"),
    ],
)
def test_default_tags_infer_the_medium_from_the_title(title, expected):
    published = datetime(2026, 8, 9, tzinfo=timezone.utc)

    assert substack_import.default_tags(title, published) == [
        expected,
        "Favorite Media",
        "Weekly Media",
        "2026",
    ]


def test_backfill_link_titles_replaces_generic_page_titles():
    body = (
        "[In The Flesh — Ecco2k](https://open.spotify.com/track/1)\n\n"
        "[Real Title](https://example.com/)"
    )
    links = {
        "citations": [],
        "internal": [],
        "external": [
            {
                "url": "https://open.spotify.com/track/1",
                "title": "Spotify – Web Player",
            },
            {"url": "https://example.com/", "title": "Example — a real page title"},
            {"url": "https://youtube.com/watch?v=1", "title": ""},
        ],
    }

    filled = substack_import.backfill_link_titles(links, body)

    assert filled["external"][0]["title"] == "In The Flesh — Ecco2k"
    assert filled["external"][1]["title"] == "Example — a real page title"
    # nothing in the body to fall back on, so it stays empty rather than inventing one
    assert filled["external"][2]["title"] == ""


def test_build_post_produces_repo_shaped_frontmatter(monkeypatch):
    body = "<h2>Books</h2><p>Something I read.</p>"
    monkeypatch.setattr(substack_import, "fetch_text", lambda *a, **kw: _page(body))

    post = substack_import.build_post("https://reeswrites.substack.com/p/x")

    assert post["layout"] == "post"
    assert post["type"] == "list"
    assert post["slug"] == "what-i-read-the-week-of-2026-08-02"
    assert post["description"] == "Read and liked!"
    assert post["tags"] == ["Books", "Favorite Media", "Weekly Media", "2026"]
    assert post["publish_datetime"].startswith("2026-08-09T")
    assert post.content == "## Books\n\nSomething I read."
