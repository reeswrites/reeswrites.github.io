---
layout: page
title: "Making the IndieWeb Beginner-Friendly"
category: WIP
permalink: /wip/beginner-friendly-indieweb
---

> Keep in mind that this is still a Work in Progress.

## Why the IndieWeb? Why make it easier?

Software has been getting increasingly complex, which includes making websites. However, there has been a recent move to make it easier or to strip it down to its bare essentials.
* [An Easy Web](https://flamedfury.com/posts/an-easy-web/)
* [Making Websites Should Be Easy](https://flamedfury.com/posts/making-websites-should-be-easy/ )
* [HTML Energy](https://html.energy/)

The IndieWeb comes partly from the idea that we should own our content
* [Wordpress is a mess](https://lwn.net/Articles/991906/)

## How?

### Creating Easy-to-Use Tooling

If we use GitHub Pages + Jekyll, we can easily publish static-sites.
* Ease of publishing is a key part of this, we want people to have something published on the Internet
* Jekyll is easy because it’s Markdown to start with and then you can go heavier if you want (HTML, CSS, JavaScript, Liquid)

Jekyll and Git/GitHub are not the most user-friendly, but I think that there can be tooling built to abstract the setup and command line and provide some assistance with source control and publishing then it’s a pretty easy tool to have for kids or adults to start learning with.

The easiest and potentially most high-impact way I can think of doing this is by creating a VSCode extension.
* VSCode already has Git/source control integration so just teach how to use that and doesn’t need to learn command line unless they want to 

Features:
* Jekyll Theme Marketplace where you can download and use Jekyll themes
* Setup syntax highlighting for Markdown, HTML, and Liquid (sometimes all in the same file)
* Run rebuilding process in background with toggles for live reload etc
* Handle Ruby installation and other Gems and add-ons 

### Education

Use IndieWeb resources like the wiki

Create more a curriculum so that people can understand the massive number of things that you can do with your own website

## What IndieWeb concepts should be taught?

IndieWeb Pages
* /uses
* /now

IndieWeb Concepts:
* Blogrolls/Directories
* Digital Gardens
* Feeds (RSS, h-feed)
* Personal Data Ownership (POSSE, PESOS)
* Stream
    * [Linus's Stream](https://stream.thesephist.com/)

General Web Concepts:
* Analytics 
* Webrings

Blog Posts: Tagging and Categories