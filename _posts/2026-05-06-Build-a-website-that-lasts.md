---
layout: post
type: stub
tags:
- IndieWeb/Meta-blogging
- '2026'
title: Build a website that lasts
slug: build-a-website-that-lasts
description: My perspective on how to build a website on the shifting grounds of the
  Web.
started_at: '2024-02-05 15:56:00'
publish_datetime: '2026-05-06T20:40:01-04:00'
links:
  internal: []
  external:
  - url: https://boringtechnology.club/
    title: Choose Boring Technology
  - url: https://en.wikipedia.org/wiki/Link_rot
    title: Link rot - Wikipedia
  - url: https://quotebacks.net/
    title: Quotebacks - Quote the web
  - url: https://stephango.com/file-over-app
    title: File over app — Steph Ango
  - url: https://permacomputing.net/
    title: permacomputing
  - url: https://wordpress.com/100-year/?ref=blog
    title: The WordPress.com 100-Year Plan
---

Stick to using technologies that have been used for a while
* Technologies that have been used for a while have a higher likelihood of lasting a longer time
* Jekyll (which I use) was first released in 2008. While it does not get a lot of releases, it is still being supported now and I haven't had any problems.
  * Similarly Hugo was created in 2015 and Eleventy in 2017, both very popular static site generators.
* This is sometimes called ["Choose Boring Technology"](https://boringtechnology.club/)

Do not assume that linked content will last forever
* Prevent [link rot](https://en.wikipedia.org/wiki/Link_rot)
* I have started using blockquotes and quotes and linking back to original sources, especially with tweets
  * You could also use [Quotebacks](https://quotebacks.net/)

Compile into HTML or something that is plain text readable
* The CEO of Obsidian talked a lot about ["file over app"](https://stephango.com/file-over-app)
* This site (made with Jekyll) is all Markdown that compiles into HTML so it is readable and portable

Host your own stylesheets, JavaScript, images, and data if you can
* Relying on external services, relies on network connection, and those services existing via corporations
  * I say this using a CDN for my images so I can get screwed there, but for me I wanted fast images not stored in Git so it was a compromise I had to make for my own needs.
* If you want to host things, externally, like in a CDN have some sort of fallback system for local copies
* You should be able to lift and shift your website very easily just in case you need to move hosting services

If thinking like this interests you, definitely check out: 
* [Permacomputing](https://permacomputing.net/)
* [100 Year Plan \| Wordpress](https://wordpress.com/100-year/?ref=blog)

<a href="https://news.indieweb.org/en" class="u-syndication">
  Also posted on IndieNews
</a>