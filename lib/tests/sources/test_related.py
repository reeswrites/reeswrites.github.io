"""Tests for the precomputed related-by-tag blocks (lib/etl/sources/related.py).

The layout used to compute these live from ``site.tags``; the source must
reproduce that exactly, so each test pins one rule the old Liquid had:
newest-first order with a path tie-break, the per-branch limits, year tags
and single-post tags skipped, self-exclusion by title inside the limit, and
Jekyll's own handling of tags, slugs, future and unpublished posts.
"""

from __future__ import annotations

from datetime import date

import pytest

from lib.etl import config
from lib.etl.sources.related import (
    _jekyll_tags,
    _load_posts,
    build_related,
    generate_related,
    jekyll_pretty_slug,
    post_url,
)

from .conftest import load_output


def _post(stem, tags, title=None, d=None, description=None):
    y, m, dd = (int(x) for x in stem.split("-")[:3])
    return {
        "stem": stem,
        "path": f"/site/_posts/{stem}.md",
        "date": d or date(y, m, dd),
        "title": title or stem,
        "url": f"/posts/{stem}/",
        "description": description,
        "tags": tags,
    }


def _titles(entry, i=0):
    return [p["title"] for p in entry["groups"][i]["posts"]]


def test_single_tag_lists_newest_first_and_drops_itself_inside_the_limit():
    posts = [_post(f"2024-01-0{i}-p{i}", ["Beer"]) for i in range(1, 8)]
    rel = build_related(posts)
    # newest 5 are p7..p3; p7 drops itself, so its list shows only 4
    assert _titles(rel["2024-01-07-p7"]) == [
        "2024-01-06-p6",
        "2024-01-05-p5",
        "2024-01-04-p4",
        "2024-01-03-p3",
    ]
    # p1 is outside the newest 5, so it sees a full 5
    assert len(_titles(rel["2024-01-01-p1"])) == 5
    assert rel["2024-01-01-p1"]["single"] is True


def test_same_date_ties_break_on_path_descending():
    posts = [
        _post("2024-01-01-a", ["X"]),
        _post("2024-01-01-b", ["X"]),
        _post("2024-01-01-c", ["X"]),
    ]
    rel = build_related(posts)
    assert _titles(rel["2024-01-01-a"]) == ["2024-01-01-c", "2024-01-01-b"]


def test_tag_with_only_this_post_shows_nothing():
    rel = build_related([_post("2024-01-01-lonely", ["Solo"])])
    assert rel["2024-01-01-lonely"]["groups"] == []


def test_several_tags_skip_year_and_single_post_tags_and_cap_at_four():
    posts = [_post(f"2024-02-0{i}-b{i}", ["Beer", "2024"]) for i in range(1, 7)]
    posts.append(_post("2024-03-01-me", ["Beer", "2024", "Solo"]))
    rel = build_related(posts)["2024-03-01-me"]
    assert rel["single"] is False
    assert [g["tag"] for g in rel["groups"]] == [
        "Beer"
    ]  # 2024 is a year tag, Solo has one post
    assert _titles(rel) == [
        "2024-02-06-b6",
        "2024-02-05-b5",
        "2024-02-04-b4",
    ]  # top 4 minus itself
    assert rel["hr"] is True  # Beer + Solo hold 8 posts, more than its 3 tags


def test_divider_needs_more_posts_than_tags():
    posts = [_post("2024-01-01-a", ["P", "Q"]), _post("2024-01-02-b", ["Q"])]
    rel = build_related(posts)["2024-01-01-a"]
    # P has 1 post, Q has 2: 3 posts > 2 tags, so the divider shows
    assert rel["hr"] is True
    assert [g["tag"] for g in rel["groups"]] == ["Q"]
    untagged = build_related([_post("2024-01-01-z", [])])["2024-01-01-z"]
    assert untagged == {"single": False, "hr": False, "groups": []}


def test_tags_normalize_like_jekyll():
    # a stray "- - Libraries" in front matter parses as a nested list
    assert _jekyll_tags(["Reading", ["Libraries"], None, "2023"]) == [
        "Reading",
        "Libraries",
        "2023",
    ]
    assert _jekyll_tags("Beer Travel") == ["Beer", "Travel"]
    assert _jekyll_tags(None) == []
    assert _jekyll_tags([2024]) == ["2024"]


def test_slugs_and_urls_follow_jekyll_pretty_mode():
    assert jekyll_pretty_slug("I-Drank-1,000-Beers") == "I-Drank-1,000-Beers"
    assert jekyll_pretty_slug("snake_case and spaces?") == "snake-case-and-spaces"
    assert post_url("café-notes") == "/posts/caf%C3%A9-notes/"


@pytest.fixture()
def site(tmp_path, monkeypatch):
    out = tmp_path / "_data"
    out.mkdir()
    monkeypatch.setattr(config, "SITE_ROOT", str(tmp_path))
    monkeypatch.setattr(config, "OUTPUT_DATA_DIR", str(out))
    posts = tmp_path / "_posts"
    posts.mkdir()

    def write(stem, fm):
        (posts / f"{stem}.md").write_text(f"---\n{fm}\n---\n\nbody\n", encoding="utf-8")

    write(
        "2024-01-01-First",
        "title: First\nslug: first-one\ndescription: The first.\ntags:\n- Beer",
    )
    write("2024-01-02-Second", "title: Second\ntags:\n- Beer")
    write("2024-01-03-Untitled-Post", "tags:\n- Beer")
    write("2024-01-04-Hidden", "title: Hidden\npublished: false\ntags:\n- Beer")
    write("2999-01-01-Future", "title: Future\ntags:\n- Beer")
    return out


def test_loader_skips_unpublished_and_future_posts_and_titles_from_slug(site):
    posts = {
        p["stem"]: p for p in _load_posts(site.parent / "_posts", date(2026, 1, 1))
    }
    assert set(posts) == {
        "2024-01-01-First",
        "2024-01-02-Second",
        "2024-01-03-Untitled-Post",
    }
    assert (
        posts["2024-01-01-First"]["url"] == "/posts/first-one/"
    )  # front matter slug wins
    assert posts["2024-01-02-Second"]["url"] == "/posts/Second/"
    assert posts["2024-01-03-Untitled-Post"]["title"] == "Untitled Post"


def test_generate_writes_related_json(site):
    generate_related()
    data = load_output(site, "related")
    assert "last_updated" in data
    first = data["2024-01-01-First"]
    assert [p["title"] for p in first["groups"][0]["posts"]] == [
        "Untitled Post",
        "Second",
    ]
    assert first["groups"][0]["posts"][1] == {
        "title": "Second",
        "url": "/posts/Second/",
        "description": None,
    }


def test_untitled_post_is_titled_from_its_filename_not_its_slug(tmp_path):
    # Jekyll titleizes the filename slug; a front matter slug only changes the URL
    posts = tmp_path / "_posts"
    posts.mkdir()
    (posts / "2024-01-01-From-The-Filename.md").write_text(
        "---\nslug: custom-url\ntags:\n- Beer\n---\n\nbody\n", encoding="utf-8"
    )
    (post,) = _load_posts(posts, date(2026, 1, 1))
    assert post["title"] == "From The Filename"
    assert post["url"] == "/posts/custom-url/"


def test_divider_counts_only_topical_posts_against_all_tags():
    # The layout compares posts under non-year tags with the post's tag count,
    # year tags included: Beer holds 2 posts and the post has 2 tags, so no
    # divider, however many posts share the year tag.
    posts = [_post("2024-05-01-me", ["Beer", "2024"]), _post("2024-04-01-b", ["Beer"])]
    posts += [_post(f"2024-0{i}-01-y{i}", ["2024"]) for i in range(1, 4)]
    rel = build_related(posts)["2024-05-01-me"]
    assert rel["hr"] is False
    assert [g["tag"] for g in rel["groups"]] == ["Beer"]


def test_year_tags_are_whatever_starts_with_20_like_the_old_liquid():
    # The layout skipped tags whose first two characters are "20". That is a
    # quirk, kept so the output matches: "20th Century" is skipped as if it were
    # a year, while "1999" is shown as a topic.
    posts = [_post("2024-03-01-me", ["20th Century", "1999"])]
    posts += [
        _post("2024-02-01-a", ["20th Century", "1999"]),
        _post("2024-01-01-b", ["1999"]),
    ]
    rel = build_related(posts)["2024-03-01-me"]
    assert [g["tag"] for g in rel["groups"]] == ["1999"]


def test_single_tag_entries_carry_no_divider_flag():
    # In the one-tag branch the layout draws the divider with its single group,
    # so a flag there would be data nothing reads.
    posts = [_post("2024-01-01-a", ["Beer"]), _post("2024-01-02-b", ["Beer"])]
    assert set(build_related(posts)["2024-01-01-a"]) == {"single", "groups"}
