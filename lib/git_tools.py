import argparse
import json
import os
from collections import defaultdict
from datetime import datetime

from pydriller import Repository


def get_publish_date(post_path):
    # get original file path to post file by traversing git history and checking for commits that modified the post file, if a commit modified the post file and the change type was a rename, update the original file path to the old file path of the modified file in that commit
    original_post_path = post_path
    for commit in Repository(
        ".", filepath=post_path, order="reverse"
    ).traverse_commits():
        for modified_file in commit.modified_files:
            if (
                modified_file.new_path == post_path
                and modified_file.change_type.name == "RENAME"
            ):
                original_post_path = modified_file.old_path

    # get first commit that modified the post file and return its date as ISO string
    for commit in Repository(".", filepath=original_post_path).traverse_commits():
        for modified_file in commit.modified_files:
            filepath = modified_file.new_path or modified_file.old_path
            if filepath == post_path:
                return commit.committer_date.isoformat()


def update_changelog(args: argparse.Namespace):
    # changelog dict to group entries by date
    changelog = defaultdict(list)

    if os.path.isfile("_data/changelog.json"):
        # load changelog entries from file
        with open("_data/changelog.json", "r") as f:
            entries = json.load(f)["entries"]

        # get latest changelog date from file as datetime
        since = datetime.strptime(max([entry["date"] for entry in entries]), "%Y-%m-%d")

        # can't use dict comprehension b/c will get rid of defaultdict abilities
        for item in entries:
            changelog[item["date"]] = item["entries"]
    else:
        since = None

    for commit in Repository(".", since=since).traverse_commits():
        commit_date = commit.author_date.date().isoformat()
        commit_message = commit.msg

        # make sure run doesn't duplicate commits
        if commit_message not in changelog[commit_date]:
            changelog[commit_date].append(commit_message)

    with open("_data/changelog.json", "w") as f:
        f.write(
            json.dumps(
                {
                    "entries": [
                        {"date": key, "entries": value}
                        for key, value in changelog.items()
                    ]
                },
                indent=4,
            )
        )
