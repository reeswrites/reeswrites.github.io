import argparse
import os
from datetime import datetime

# oyaml is a drop-in replacement for PyYAML which preserves dict ordering
# import before everything so python-frontmatter uses oyaml
import oyaml as yaml
import frontmatter

# from cli import prompt
from git_tools import get_publish_date

draft_directory = "_drafts"
post_directory = "_posts"


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