# oyaml is a drop-in replacement for PyYAML which preserves dict ordering
# import before everything so python-frontmatter uses oyaml
import oyaml as yaml 

import frontmatter

# from os import listdir
# from os.path import isfile, join

import os


post_directory = "_posts"


# inspired by: https://landscapearchaeology.org/2019/frontmatter/
for file_name in os.listdir(post_directory):
    # get file path to post within post directory
    file_path = os.path.join(post_directory, file_name)

    # check if object is nested subfolder, if so, skip
    if not os.path.isfile(file_path): continue

    # load post with python-frontmatter
    post = frontmatter.load(file_path)

    # if post["type"] in ["recipe", "project"]:
    #     post["layout"] = post["type"]

    if post.get("category") == "Garden":
        post["category"] = "Posts"

    if post.get("categories"):
        category = post.get("categories")
        del post["categories"]

        post["category"] = category

    # if post.get("categories") and post["categories"] in ["Articles", "Notes", "Stubs", "Lists"]:
    #     # post["categories"] = "Garden"
    #     del post["categories"]

    #     post["category"] = "Garden"

    with open(file_path, "w", encoding="utf-8") as f:
        f.write(frontmatter.dumps(post))