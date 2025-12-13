---
layout: post
type: article
tags:
- Jekyll
- '2024'
title: Jekyll Page Backlinks Without Plugins
slug: page-backlinks-without-plugins
description: Adding backlinks to pages in Jekyll in Pure Liquid.
---

## Background

When I am writing a new post, there's nothing like the feeling I get when I am able to link to another post that I've previously written. I like the idea that I am writing information that is related to each other and that each subsequent post is building on top of my other thoughts.

While I don't use [Obsidian](https://obsidian.md/), it was this tool that first brought to my attention the concept of "backlinks", or the idea that you can see what pages link to the current page. I thought that this would be the perfect addition to my website, especially as I continue to write more and link back to my other posts.

Not using a plugin so these approaches don't work:
* [Jekyll Backlinks by Paul Willard](https://terminaladdict.com/jekyll/development/2021/02/05/Jekyll-Backlinks.html)
* [Really Basic Backlinks in Jekyll by Daniel Miller](https://www.daniel.industries/2023/01/29/really-basic-backlinks-in-jekyll)

Luckily Daniel’s article pointed me to an easy Pure Liquid solution: [Pure Liquid Jekyll Backlinks](https://gist.github.com/xplosionmind/605e4a2a67ec704dfb738d9d6b984941) which is something that had crossed my mind before but I had never sat down and thought about. Using this GitHub Gist as the base of my approach, I was able to get something working that is good enough for me and where my site is right now.

## Implementation Details

It was pretty easy to implement, but there were some slight intricacies:
1. I don’t use literal URLs when linking to posts, I use the `post_url` Liquid tag which is not resolved when I get `page.content` when searching for backlinks
    * Luckily a Jekyll page knows its own file name via `page.path` so I was able to strip “_posts/“ and “.md” out of it so I could get the filename that is used in the `post_url` tag and check for references to that instead of `page.url`
2. I had to use an array so I could know if there were no backlinks because I don't want to display the backlink information/header when there are no backlinks to that post
    * Annoying that I have to do another for loop instead of just rendering a list directly when checking for backlinks but it’s not the end of the world because it is a much smaller loop iteration count
    * It’s a bit hacky because its Liquid, but luckily Jekyll defines a `push` Liquid filter which made it very easy to do
    * https://stackoverflow.com/questions/45926668/how-do-i-create-an-array-from-a-forloop
3. A page might start including pages as a backlink that include a menu that links to the page.
    * I got around this by putting a trailing backslash in the `permalink` frontmatter attribute. The browser will still navigate to the page fine, but when comparing values to `page.permalink` the backlink will only count if you have the trailing backslash. This allows you to not use the trailing backslash in the menu if you don't want it to count as a backlink.

There are also some limitations:
1. If a post link is rendered via iterating through `site.posts` there is no straightforward way of detecting that
    * I have post index pages that are rendered this way and I just decided to let it go and not try to detect it as a backlink.
2. If you have root pages it might be weird like /foo and /foo/bar
    * If you have a link to /foo/bar, /foo will be matched with Liquid `contains` and count as a backlink
    * You will either need to rename your root pages, figure a way to filter these pages out, or don't use root pages as indexes

Potential Improvements:
* Move the Liquid code to an include and use [jekyll-include-cache](https://github.com/benbalter/jekyll-include-cache)

## Code

For pages:
{% raw %}
```liquid
<!-- initialize an empty array -->
{% assign backlinks = '' | split: '' %}

{% for entry in site.pages %}
    <!-- don't care about generated JSON files but still counts as a page -->
    {% unless entry.url contains ".json" %}
        {% if entry.content contains page.permalink %}
            {% assign backlinks = backlinks | push: entry %}
        {% endif %}
    {% endunless %}
{% endfor %}

{% for entry in site.posts %}
    {% if entry.content contains page.permalink %}
        {% assign backlinks = backlinks | push: entry %}
    {% endif %}
{% endfor %}
```
{% endraw %}

For posts:
{% raw %}
```liquid
{% assign backlinks = '' | split: '' %}
{% assign filename = page.path | remove: "_posts/" | remove: ".md" %}

{% for entry in site.pages %}
    {% unless entry.url contains ".json" %}
        {% if entry.content contains filename %}
            {% assign backlinks = backlinks | push: entry %}
        {% endif %}
    {% endunless %}
{% endfor %}

{% for entry in site.posts %}
    {% if entry.content contains filename %}
        {% assign backlinks = backlinks | push: entry %}
    {% endif %}
{% endfor %}
```
{% endraw %}

Rendering backlinks:
{% raw %}
```liquid
{% if backlinks.size > 0 %}
    <p>
        Pages That Link Here:
    </p>

    <ul>
        {% for entry in backlinks %}
            <li>
                <a href="{{ entry.url }}">{{ entry.title }}</a>
            </li>
        {% endfor %}
    </ul>
{% endif %}
```
{% endraw %}