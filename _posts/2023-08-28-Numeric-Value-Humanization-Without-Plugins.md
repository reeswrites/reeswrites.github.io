---
layout: post
tags:
- Jekyll
title: Numeric Value Humanization Without Plugins
slug: humanization-without-plugins
description: Numeric Value Humanization Without Plugins
category: Posts
type: article
---

When I was building a statistics page that included word counts, I wanted to have a thousands place number separator, which is a comma (",") in the US. This a task sometimes referred to as "humanization". I thought that this would be an easy task, but for some reason there is [no built in Liquid function to do value humanization](https://stackoverflow.com/questions/35247407/jekyll-liquid-way-to-print-numbers-with-separator-character). There are plugins to do this, such as [jekyll-humanize by Ryan Morrissey](https://github.com/23maverick23/jekyll-humanize) and [Liquid-Thousands-Separated-Filter by Matt Gemmell](https://github.com/MichaelCurrin/liquid-thousands-separated-filter). However, since I am in the GitHub Pages Jekyll sandbox, I am unable to use external plugins that are not already [bundled into the GitHub Pages environment](https://pages.github.com/versions/). While plugins would certainly make it easier, I knew that it wouldn't be impossible to implement in Liquid. With that being said, I had no idea how I would implement it in Liquid.

I first found [Daniel Vorhauer's gist](https://gist.github.com/hexerei/5bd632b2a179717e219fbe18c5793181) which linked to [John Teske's gist](https://gist.github.com/johnteske/aab61e8a43ca54dc30ac04888a29cbf1) whose simplistic approach was just what I needed.

{% raw %}
```liquid
{% assign digits = include.number | split:'' %}{% for digit in digits %}{% assign threeFromEnd = digits.size | minus:forloop.index | modulo: 3 %}{% if threeFromEnd == 2 and forloop.index != 1 %}{{ digit | prepend: ',' }}{% else %}{{ digit }}{% endif %}{% endfor %}
```
{% endraw %}

You utilize the function via an include:
{% raw %}
```liquid
{% include numberWithCommas.html number=10000 %}
```
{% endraw %}

`numberWithCommas.html` is what I named the file in my `_includes/` folder and the number argument can be a literal value or a Jekyll variable name.

When I was using John's snippet I first noticed how it looked minified, but after trying to indent the code to make it more readable I realized that it was because it affected whitespace. I begrudgingly accepted this since it was in an `include` tag, but it wasn't until I was reading the Liquid documentation another day that I found out about [whitespace control](https://shopify.github.io/liquid/basics/whitespace). I think I may have been too gung-ho with the `-` operator, but it works, but I think I'm just going to keep it.

{% raw %}
```liquid
{%- assign digits = include.number | split: '' -%}
{%- for digit in digits -%}
    {%- assign threeFromEnd = digits.size | minus: forloop.index | modulo: 3 -%}
    {%- if threeFromEnd == 2 and forloop.index != 1 -%}
        {{ digit | prepend: ',' }}
    {%- else -%}
        {{ digit }}
    {%- endif -%}
{%- endfor -%}
```
{% endraw %}

This process has opened my eyes to a whole method of approximating functions with `includes` in Jekyll, as I found out after reading [Hamish Willee's article](https://hamishwillee.github.io/2014/11/13/jekyll-includes-are-functions). In his article, he mentions how "Comments, space and newlines in functions are part of the output," so I wonder how many people know about the whitespace control features in Liquid. This is probably a common phenomenon because I only know as much Liquid as I need to know, which is to say, as much as is needed to accomplish what I want to do. It was only by sheer coincidence that I found the Liquid documentation page on whitespace control.