---
layout: writing
categories: Writing
tags: Jekyll
title: "Word Count Statistics Without Plugins"
permalink: /writing/word-count-without-plugins
description: "Word Count Statistics Without Plugins"
---

When I wanted to implement a [statistics page inspired by Luke Harris](https://www.lkhrs.com/stats), I went on a search for how to implement it in Jekyll. In my search, I came across [Jake Lee's article](https://blog.jakelee.co.uk/calculating-jekyll-blog-word-count-and-more) which mentioned the plugin [Jekyll-Posts-Word-Count by 
Matt Gemmell](https://github.com/mattgemmell/Jekyll-Posts-Word-Count). Since I am still in the GitHub Pages Jekyll sandbox, I am unable to use external plugins that are not already [bundled into the GitHub Pages environment](https://pages.github.com/versions/). However, I did not fret, for I knew that this would essentially amount to a singular for loop, something that is very easy to do in Liquid.

Thus I came up with the following code to calculate the total number of words in Jekyll posts, the average number of words per post, as well as the longest and shortest Jekyll posts with their respective word counts.

{% raw %}
```liquid
<!-- create variable for storing number of words across all posts -->
{% assign total_words = 0 %}

<!-- create variables for storing largest number of words + the longest post -->
{% assign max_words = site.categories.Writing.first.content | number_of_words %}
{% assign longest_article = site.categories.Writing.first %}

<!-- create variables for storing smallest number of words + the shortest post -->
{% assign min_words = max_words %}
{% assign shortest_article = longest_article %}

<!-- min/max and longest/shortest are initialized to the same values -->
<!-- because they are just placeholder values -->
    
<!-- iterate through all posts within the Writing category (could be any category you want) -->
<!-- you could also do this by tag with site.tags.tag_name -->
{% for post in site.categories.Writing %}
    <!-- get word count of post -->
    {% assign word_count = post.content | number_of_words %}

    <!-- add word count of the post to the total count -->
    {% assign total_words = total_words | plus: word_count %}
    
    <!-- update longest article -->
    {% if word_count > max_words %}
        {% assign max_words = word_count %}
        {% assign longest_article = post %}
    <!-- update shortest article -->
    {% elsif word_count < min_words %}
        {% assign min_words = word_count %}
        {% assign shortest_article = post %}
    {% endif %}
{% endfor %}

<!-- calculate the average number of words per article -->
{% assign num_articles = site.categories.Writing | size %}
{% assign avg_words = total_words | divided_by: num_articles %}
```
{% endraw %}

You can see this code in action in the [Statistics section on my Writing page](/writing#Statistics).