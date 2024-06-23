---
layout: post
category: Posts
type: article
tags:
- Jekyll
title: How to bulk edit Jekyll frontmatter with Python
slug: bulk-edit-jekyll-frontmatter-python
description: A guide on how to bulk edit Jekyll post frontmatter with python-frontmatter
  and oyaml.
---

When I was first working on my [digital garden](/posts) I had a number of different Jekyll categories (Article, List, Stub, Notes) that I wanted to collapse into one Garden category. I had 60+ posts at the time and knew that I didn't want manually go in and change every file. I didn't find much on Google but I found exactly what I needed in [this guide by Zoran Čučković](https://landscapearchaeology.org/2019/frontmatter/) on how to bulk edit posts for Jekyll. It uses the [python-frontmatter](https://github.com/eyeseast/python-frontmatter) package which is a lovely library that makes it very simple to read and write (Jekyll-style) YAML frontmatter with Python.

This guide/script worked almost perfectly for me out of the box, but I could never be so lucky. When I was running my Python script I  noticed that files that shouldn't have been changed were being changed. I initially thought the problem was me and that my code was incorrect, but then I realized that the frontmatter data was being written back in alphabetical order [because of the YAML library](https://stackoverflow.com/questions/16782112/can-pyyaml-dump-dict-items-in-non-alphabetical-order) that python-frontmatter uses. 

Although I do appreciate alphabetical order as an organization method, I had a specific order of frontmatter attributes that I wanted to keep and didn't want to change. I didn't want to patch python-frontmatter to update its PyYAML calls, but with a simple Google search I was able to find [oyaml](https://github.com/wimglenn/oyaml/), a drop-in replacement for [PyYAML](https://github.com/yaml/pyyaml) (what python-frontmatter uses), which preserves dict attribute ordering. All you have to do to use it is to import it with the same name as PyYAML module (yaml) before you import python-frontmatter so that it uses oyaml instead of PyYAML. Like so:

```python
# must be imported before frontmatter and as yaml
import oyaml as yaml 
import frontmatter
```

My final script ended up looking something like this:
```python
import os

import oyaml as yaml 
import frontmatter

for file_name in os.listdir("_posts"):
    # get file path to post within post directory
    file_path = os.path.join(post_directory, file_name)

    # load post with python-frontmatter
    post = frontmatter.load(file_path)

    # make some kind of modification to the frontmatter
    if post["type"] == "recipe":
        post["layout"] = "recipe"

    # write back updated post to file
    with open(file_path, "w", encoding="utf-8") as file:
        file.write(frontmatter.dumps(post))
```

Once you have your script set up to bulk edit Jekyll frontmatter the possibilities are endless. You could:
* Migrate from using the `permalink` to the `slug` attribute to create a [flexible linking system in Jekyll]({% post_url 2024-01-06-Creating-a-Flexible-Linking-System-in-Jekyll %})
* Change `layout` names depending on `category`
* Rename `tag` or merge into other tag