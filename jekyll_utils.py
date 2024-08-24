# oyaml is a drop-in replacement for PyYAML which preserves dict ordering
# import before everything so python-frontmatter uses oyaml
import oyaml as yaml 

import os
import json

import frontmatter

from collections import defaultdict
from datetime import datetime

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
    posts_by_type = defaultdict(int)
    posts_by_tag = defaultdict(int)

    # inspired by: https://landscapearchaeology.org/2019/frontmatter/
    for file_name in os.listdir(post_directory):
        # get file path to post within post directory
        file_path = os.path.join(post_directory, file_name)

        # check if object is nested subfolder, if so, skip
        if not os.path.isfile(file_path): continue

        # load post with python-frontmatter
        post = frontmatter.load(file_path)

        # iterate through post tags
        post_tags = [] if post.get("tags") is None else post["tags"]
        for tag in post_tags:
            posts_by_tag[tag] += 1

        posts_by_type[post["type"]] += 1

    print(json.dumps(posts_by_tag, indent=4))

    # TODO sort and print by post type
    print(json.dumps(posts_by_type, indent=4))


if __name__ == "__main__":
    format_frontmatter()

    update_changelog()

    get_stats()