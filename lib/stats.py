import os
import re
from collections import defaultdict
from datetime import datetime
from itertools import groupby

import frontmatter
from tabulate import tabulate

post_directory = "_posts"
MONTH_NAMES = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
]


def show_posts_by_tag(posts):
    posts_by_tag = defaultdict(int)

    for post in posts:
        # keep track of posts by tag
        post_tags = [] if post.get("tags") is None else post["tags"]
        for tag in post_tags:
            posts_by_tag[tag] += 1

    print(
        tabulate(
            [
                [tag, num_posts]
                for tag, num_posts in sorted(
                    posts_by_tag.items(), key=lambda x: x[1], reverse=True
                )
            ],
            headers=["Tag", "# of Posts"],
            tablefmt="orgtbl",
        )
    )
    print()


def show_posts_by_type(posts):
    posts_by_type = defaultdict(int)

    for post in posts:
        # keep track of posts by post type
        posts_by_type[post["type"]] += 1

    # get last 50 articles and essays sorted by date (most recent last)
    # posts = list(
    #     filter(
    #         lambda x: x["type"] in ["article", "essay"],
    #         sorted(
    #             get_posts(),
    #             key=lambda x: x["date"]
    #         )
    #     )
    # )[-50:]

    print(
        tabulate(
            [
                [post_type.title(), num_posts]
                for post_type, num_posts in sorted(
                    posts_by_type.items(), key=lambda x: x[1], reverse=True
                )
            ],
            headers=["Post Type", "# of Posts"],
            tablefmt="orgtbl",
        )
    )

    print()

    print(
        f"# of Articles and Essays: {posts_by_type["article"] + posts_by_type["essay"]}"
    )


def count_words_in_markdown(markdown):
    """
    https://github.com/gandreadis/markdown-word-count/blob/master/mwc/counter.py
    """
    text = markdown

    # Comments
    text = re.sub(r"<!--([\s\S]*?)-->", "", text, flags=re.MULTILINE)
    # Tabs to spaces
    text = text.replace("\t", "    ")
    # More than 1 space to 4 spaces
    text = re.sub(r"[ ]{2,}", "    ", text)
    # Footnotes
    text = re.sub(r"^\[[^]]*\][^(].*", "", text, flags=re.MULTILINE)
    # Indented blocks of code
    text = re.sub(r"^( {4,}[^-*]).*", "", text, flags=re.MULTILINE)
    # Custom header IDs
    text = re.sub(r"{#.*}", "", text)
    # Replace newlines with spaces for uniform handling
    text = text.replace("\n", " ")
    # Remove images
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", text)
    # Remove HTML tags
    text = re.sub(r"</?[^>]*>", "", text)
    # Remove special characters
    text = re.sub(r"[#*`~\-–^=<>+|/:]", "", text)
    # Remove footnote references
    text = re.sub(r"\[[0-9]*\]", "", text)
    # Remove enumerations
    text = re.sub(r"[0-9#]*\.", "", text)

    return len(text.split())


def show_word_count_stats(posts):
    num_posts = len(posts)
    total_words = 0

    longest_article = None
    shortest_article = None

    for post in posts:
        with open(post["file_path"], "r") as file:
            # remove front matter (if present) and keep only markdown content
            file_contents = file.read()
            file_contents = file_contents.replace("---", "", 1)
            file_contents = file_contents[file_contents.index("---") + 3 :]

            post["word_count"] = count_words_in_markdown(file_contents)

            if (
                longest_article is None
                or post["word_count"] > longest_article["word_count"]
            ):
                longest_article = post

            if (
                shortest_article is None
                or post["word_count"] < shortest_article["word_count"]
            ):
                shortest_article = post

            total_words += post["word_count"]

    print(f"Total Words: {total_words}")
    print(f"Average Words per Article: {total_words / num_posts}")
    print(f"Longest Article: {longest_article}")
    print(f"Shortest Article: {shortest_article}")


def show_recent_post_stats(posts):
    year = datetime.today().strftime("%Y")
    month = datetime.today().strftime("%m")
    posts_this_year = list(filter(lambda x: x["date"].startswith(year), posts))
    posts_this_month = sorted(
        filter(lambda post: post["date"].split("-")[1] == month, posts_this_year),
        key=lambda post: post["date"],
    )

    for key, group in groupby(
        sorted(posts_this_year, key=lambda x: x["date"]),
        lambda post: post["date"].split("-")[1],
    ):
        posts_this_month = list(group)

        print(MONTH_NAMES[int(key) - 1] + ":", len(posts_this_month))

        for post in posts_this_month:
            print(
                f"\t{post['title']} ({post['type']}, {post['date']}): {sorted(post['tags'])}"
            )


def get_posts():
    posts = []

    # inspired by: https://landscapearchaeology.org/2019/frontmatter/
    for file_name in os.listdir(post_directory):
        # get file path to post within post directory
        file_path = os.path.join(post_directory, file_name)

        # check if object is nested subfolder, if so, skip
        if not os.path.isfile(file_path):
            continue

        # load post with python-frontmatter
        post_frontmatter = frontmatter.load(file_path)

        # keep track of posts
        posts.append(
            {
                "title": post_frontmatter["title"],
                "file_path": file_path,
                "type": post_frontmatter["type"],
                "date": "-".join(file_name.split("-")[:3]),
                "description": post_frontmatter.get("description"),
                "tags": post_frontmatter.get("tags"),
            }
        )

    return posts
