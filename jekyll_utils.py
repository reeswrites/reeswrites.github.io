# oyaml is a drop-in replacement for PyYAML which preserves dict ordering
# import before everything so python-frontmatter uses oyaml
import oyaml as yaml 

import os
import json
import re

import frontmatter

from collections import defaultdict
from datetime import datetime

from tabulate import tabulate
from pydriller import Repository


post_directory = "_posts"


def update_changelog():
    # changelog dict to group entries by date
    changelog = defaultdict(list)

    if os.path.isfile("_data/changelog.json"):
        # load changelog entries from file
        with open("_data/changelog.json", "r") as f:
            entries = json.load(f)["entries"]

        # get latest changelog date from file as datetime
        since = datetime.strptime(
            max([entry["date"] for entry in entries]), 
            "%Y-%m-%d"
        )

        # can't use dict comprehension b/c will get rid of defaultdict abilities
        for item in entries:
            changelog[item["date"]] = item["entries"]
    else:
        since = None
    
    for commit in Repository('.', since=since).traverse_commits():
        commit_date = commit.author_date.date().isoformat()
        commit_message = commit.msg

        # make sure run doesn't duplicate commits
        if commit_message not in changelog[commit_date]:
            changelog[commit_date].append(commit_message)

    with open("_data/changelog.json", "w") as f:
        f.write(json.dumps({
            "entries": [{"date": key, "entries": value} for key, value in changelog.items()]
        }, indent=4))


def format_frontmatter():
    # inspired by: https://landscapearchaeology.org/2019/frontmatter/
    for file_name in os.listdir(post_directory):
        # get file path to post within post directory
        file_path = os.path.join(post_directory, file_name)

        # check if object is nested subfolder, if so, skip
        if not os.path.isfile(file_path): continue

        # load post with python-frontmatter
        post = frontmatter.load(file_path)

        with open(file_path, "w", encoding="utf-8") as f:
            f.write(frontmatter.dumps(post))


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
                [ tag, num_posts ] 

                for tag, num_posts in sorted(
                    posts_by_tag.items(), 
                    key=lambda x: x[1], 
                    reverse=True
                )
            ],
            headers=["Tag", "# of Posts"],
            tablefmt="orgtbl"
        )
    )
    print()


def show_posts_by_type(posts_by_type):
    print(
        tabulate(
            [ 
                [ post_type.title(), num_posts ] 

                for post_type, num_posts in sorted(
                    posts_by_type.items(), 
                    key=lambda x: x[1], 
                    reverse=True
                )
            ],
            headers=["Post Type", "# of Posts"],
            tablefmt="orgtbl"
        )
    )

    print()


def count_words_in_markdown(markdown):
    """
    https://github.com/gandreadis/markdown-word-count/blob/master/mwc/counter.py
    """
    text = markdown

    # Comments
    text = re.sub(r'<!--(.*?)-->', '', text, flags=re.MULTILINE)
    # Tabs to spaces
    text = text.replace('\t', '    ')
    # More than 1 space to 4 spaces
    text = re.sub(r'[ ]{2,}', '    ', text)
    # Footnotes
    text = re.sub(r'^\[[^]]*\][^(].*', '', text, flags=re.MULTILINE)
    # Indented blocks of code
    text = re.sub(r'^( {4,}[^-*]).*', '', text, flags=re.MULTILINE)
    # Custom header IDs
    text = re.sub(r'{#.*}', '', text)
    # Replace newlines with spaces for uniform handling
    text = text.replace('\n', ' ')
    # Remove images
    text = re.sub(r'!\[[^\]]*\]\([^)]*\)', '', text)
    # Remove HTML tags
    text = re.sub(r'</?[^>]*>', '', text)
    # Remove special characters
    text = re.sub(r'[#*`~\-–^=<>+|/:]', '', text)
    # Remove footnote references
    text = re.sub(r'\[[0-9]*\]', '', text)
    # Remove enumerations
    text = re.sub(r'[0-9#]*\.', '', text)

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
            file_contents = file_contents[file_contents.index("---") + 3:]

            post["word_count"] = count_words_in_markdown(file_contents)

            if longest_article is None or post["word_count"] > longest_article["word_count"]:
                longest_article = post

            if shortest_article is None or post["word_count"] < shortest_article["word_count"]:
                shortest_article = post

            total_words += post["word_count"]

    print(f"Total Words: {total_words}")
    print(f"Average Words per Article: {total_words / num_posts}")
    print(f"Longest Article: {longest_article}")
    print(f"Shortest Article: {shortest_article}")


def show_recent_post_stats(posts):
    year = datetime.today().strftime('%Y')
    month = datetime.today().strftime('%m')
    posts_this_year = list(filter(lambda x: x["date"].startswith(year), posts))
    posts_this_month = sorted(
        filter(lambda post: post["date"].split('-')[1] == month, posts_this_year),
        key=lambda post: post["date"]
    )

    print('Posts This Year:', len(posts_this_year))
    print('Posts This Month:', len(posts_this_month))
    for post in posts_this_month:
        print(f"\t{post['title']} ({post['type']}, {post['date']}): {sorted(post['tags'])}")


def get_stats():
    posts = []

    posts_by_type = defaultdict(int)

    # inspired by: https://landscapearchaeology.org/2019/frontmatter/
    for file_name in os.listdir(post_directory):
        # get file path to post within post directory
        file_path = os.path.join(post_directory, file_name)

        # check if object is nested subfolder, if so, skip
        if not os.path.isfile(file_path): continue

        # load post with python-frontmatter
        post_frontmatter = frontmatter.load(file_path)

        # keep track of posts
        posts.append({
            "title": post_frontmatter["title"],
            "file_path": file_path,
            "type": post_frontmatter["type"],
            "date": "-".join(file_name.split("-")[:3]),
            "tags": post_frontmatter.get("tags")
        })

        # keep track of posts by post type
        posts_by_type[post_frontmatter["type"]] += 1
   
    show_posts_by_tag(posts)
    show_posts_by_type(posts_by_type)

    print(f"# of Articles and Essays: {posts_by_type["article"] + posts_by_type["essay"]}")

    show_recent_post_stats(posts)

   
if __name__ == "__main__":
    format_frontmatter()

    # update_changelog()

    # get_stats()