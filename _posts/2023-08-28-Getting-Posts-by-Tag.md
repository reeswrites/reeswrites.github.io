---
layout: article
categories: Articles
tags: ["Jekyll"]
title: "Getting Posts by Tag"
slug: jekyll-posts-by-tag
description: "How I improved my Liquid code in Jekyll to display posts by tag."
---

## Background

In [Jekyll](https://jekyllrb.com), you can display posts by category `site.categories.category_name` and in the same way you can get by tag with `site.tags.tag_name` However, for my site I wanted to have a list of posts by tags where the heading would be the tag name followed by a list of posts under that tag. I also wanted to have an optional tag description that would be displayed under the tag name to contextualize or explain the tag and posts.

In my `articles.html` file which serves my `/articles` page, I have a Jekyll front matter variable called `writing_tags`. You can name it whatever you want, as long as it's descriptive. You will access it via `page.variable_name` in your Liquid code in your file.

```yaml
writing_tags:
    - name: Interior Design
    - name: College
    - name: Living Better
    - name: Loving Better
    - name: Computer Science Education
    - name: Reading
```

## My First Version

To get posts by tag name, I based my code off of [Joe Kampschmidt's article](https://www.jokecamp.com/blog/listing-jekyll-posts-by-tag). To me, order of the tags was important, so in the for loop, I had to make sure that iterating through `writing_tags` was on the outer loop. If you wanted have the tags in whatever order Jekyll is using, you could have: `site.tags` in the outer loop, and if you wanted tags in alphabetical order you'd use: `site.tags | sort`. I used this approach on my website for about a year, before finding out a new and improved way to do it.

{% raw %}
```liquid
<!-- iterate through all writing_tags -->
{% for writing_tag in page.writing_tags %}
    <!-- iterate through all Jekyll (site) tags -->
    {% for tag in site.tags %}
        <!-- split object into tag_name string and posts array -->
        {% assign tag_name = tag | first %}
        {% assign posts = tag | last %}
        
        <!-- if tag is this writing_tag, then render the tag section  -->
        {% if writing_tag.name == tag_name %}
            <!-- render tag name heading -->
            <h3 id="{{ tag_name }}">{{ tag_name }}</h3>

            <!-- render writing_tag description if it has one -->
            {% if writing_tag.description %}
                <p>
                    {{ writing_tag.description }}
                </p>
            {% endif %}

            <!-- render list of posts under tag -->
            <ol>
                {% for post in posts %}
                    <li>
                        <p>
                            <a href="{{ post.url }}">{{ post.title }}</a>

                            <span style="font-style: italic;">
                                (Published on {{ post.date | date: "%-m/%-d/%Y" }})
                            </span>
                        </p>
                                        
                        <p>
                            {{ post.description }}
                        </p>
                    </li>
                {% endfor %}
            </ol>
        {% endif %}
    {% endfor %}
{% endfor %}
```
{% endraw %}

## My New and Improved Version

Then I found [Ryan Palo's article](https://www.assertnotmagic.com/2017/04/25/jekyll-tags-the-easy-way/), and found out that you can access a value by key in Liquid, something that is present in other languages, but that I didn't know was available in Liquid. This allowed me to rewrite my code in a way that got rid of the nested loops of tag iteration, something that always made me feel dirty. I'm not sure if this made the file generation process any faster, but to me I think that it should.

I'm not really sure how it works because it [doesn't seem like Liquid has the concept of dictionaries/associative arrays](https://stackoverflow.com/questions/67691445/how-to-create-or-define-a-dictionary-in-liquid-templates).

{% raw %}
```liquid
{% for tag in page.writing_tags %}
    <!-- render tag name heading -->
    <h3 id="{{ tag.name }}">{{ tag.name }}</h3>

    <!-- render tag description if it has one -->
    {% if tag.description %}
        <p>
            {{ tag.description }}
        </p>
    {% endif %}

    <!-- render list of posts under tag -->
    <ol>
        {% for post in site.tags[tag.name] %}
            <li>
                <p>
                    <a href="{{ post.url }}">{{ post.title }}</a>

                    <span style="font-style: italic;">
                        (Published on {{ post.date | date: "%-m/%-d/%Y" }})
                    </span>
                </p>
                                        
                <p>
                    {{ post.description }}
                </p>
            </li>
        {% endfor %}
    </ol>
{% endfor %}
```
{% endraw %}