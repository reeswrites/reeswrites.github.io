# oyaml is a drop-in replacement for PyYAML which preserves dict ordering
# import before everything so python-frontmatter uses oyaml
import oyaml as yaml 

import os
import json

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


def get_stats():
    posts = []

    posts_by_type = defaultdict(int)
    posts_by_tag = defaultdict(int)

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
            "date": "-".join(file_name.split("-")[:3]),
            "tags": post_frontmatter.get("tags")
        })

        # keep track of posts by tag
        post_tags = [] if post_frontmatter.get("tags") is None else post_frontmatter["tags"]
        for tag in post_tags:
            posts_by_tag[tag] += 1

        # keep track of posts by post type
        posts_by_type[post_frontmatter["type"]] += 1

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

    year = datetime.today().strftime('%Y')
    month = datetime.today().strftime('%m')
    posts_this_year = list(filter(lambda x: x["date"].startswith(year), posts))
    posts_this_month = list(filter(lambda x: x["date"].split('-')[1] == month, posts_this_year))

    print('Posts This Year:', len(posts_this_year))
    print('Posts This Month:', len(posts_this_month))

    # latest_posts = sorted(posts, key=lambda x: x["date"], reverse=True)[:10]
    # latest_posts.reverse()
    # print(json.dumps(latest_posts, indent=4))


if __name__ == "__main__":
    format_frontmatter()

    update_changelog()

    get_stats()