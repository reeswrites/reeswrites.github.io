---
layout: article
categories: Articles
tags: ["Jekyll"]
title: "Using jekyll-feed with GitHub Pages"
slug: jekyll-feed-github-pages
description: "A guide on how to setup and use the jekyll-feed plugin on GitHub pages."
---

## What is `jekyll-feed`? Why use it?

`jekyll-feed` is a Jekyll plugin that allows you to automatically generate RSS feeds for your website. GitHub Pages doesn't let you use a whole lot of Jekyll plugins, but `jekyll-feed` is [whitelisted](https://pages.github.com/versions/), which is amazing. While the configuration is very easy to do, I still ran into some issues that I wanted to document here to that others won't have to go through the same troubleshooting that I had to go through.

RSS is an old technology, but it is still widely used by bloggers and podcasts alike. The [IndieWeb may be divided about the use of RSS](https://andysylvester.com/2022/10/17/what-about-the-indieweb-and-rss/), but I believe that RSS is a [great way to keep track of blogs that you want to follow without surrendering yourself to an algorithmic feed](https://jamesg.blog/2020/10/05/reading-content-with-rss/). Additionally, since `jekyll-feed` exists and makes it so easy to get started with generating an RSS feed, I think that it is a no-brainer to have it, even if no one uses it.

## Setting Up `jekyll-feed`

From the [`jekyll-feed` repository's README](https://github.com/jekyll/jekyll-feed?tab=readme-ov-file#installation):

Add this line to your site's Gemfile:

```ruby
gem 'jekyll-feed'
```
And then add this line to your site's _config.yml:

```yaml
plugins:
  - jekyll-feed
```

This will slow down your local development cycle because it will try to regenerate `feed.xml` on each change, so you should disable it in your development environment. You can modify the [plugin configuration](https://github.com/jekyll/jekyll-feed?tab=readme-ov-file#custom-styling) to do this, although you may need to [change the way you call `jekyll serve`](https://jekyllrb.com/docs/configuration/environments/).

## Styling Your `feed.xml`

Your `feed.xml` file will really just be an XML file available at yoursite.com/feed.xml, as it is mostly for feedreader programs to pull from and parse. However, `jekyll-feed` [supports using an XML spreadsheet](https://github.com/jekyll/jekyll-feed?tab=readme-ov-file#custom-styling) to style your `feed.xml` file in browser. I think that it can be pretty jarring to link to an RSS XML Feed File that the browser struggles to render in any kind of aesthetic way, and XML stylesheets help with that. Additionally, I think that it allows you to add some much needed context about what RSS is and what feedreaders are in order to help readers use your RSS feed.

After reading [this article by Darek Kay](https://darekkay.com/blog/rss-styling/), I decided to use About Feed's [pretty-feed](https://github.com/genmon/aboutfeeds/blob/main/tools/pretty-feed-v3.xsl) stylesheet. `jekyll-feed` uses Atom, so you need to change pretty-feed to use Atom properties rather than RSS ones. Darek's article has the necessary edits that you need to make, but if you want to add more things, I would advise reading about [the Atom format specification](https://www.ibm.com/docs/en/cics-ts/5.4?topic=support-overview-atom-feeds). Since pretty-feed makes it so easy to set up an XML stylesheet, I think that there is no excuse for exposing raw XML to your site's visitors.

Note: `jekyll-feed` uses an [absolute_url for linking to an XML Stylesheet](https://github.com/jekyll/jekyll-feed/blob/master/lib/jekyll-feed/feed.xml#L3). This is important to note because the [Jekyll absolute_url filter](https://jekyllrb.com/docs/liquid/filters/) uses both the `url` and `baseurl` configuration properties to generate the URL. This means that you need to set both `url` and `baseurl`, which is the thing that tripped me up the most.

### `url` Configuration

For GitHub Pages, if you are using a custom domain, you should set `url` to your custom domain with http:// or https:// in front of it. I found that you can omit the protocol from the `url` property and most things will work, but it broke the `absolute_url` filter for me. Also it is 2023 so you should be using and defaulting to https anyway.

```yaml
# if you have your own domain, use that 
url: https://reesdraminski.com

# if you do NOT have your own domain, use the GitHub pages domain
url: https://reesdraminski.github.io
```

If you are using a custom domain, you can technically use your GitHub pages domain URL as your `url` because it will just redirect, but I found that it does not work for `feed.xlst.xml` because you will get an error that the resource cannot load because "Domains, protocols, and ports must match." This is understandable from a security perspective, and an easy fix, just requires a small config change.

### `baseurl` Configuration 

```yaml
# if your site is hosted at the domain root, you don't need a baseurl
baseurl: ""

# if your site is hosted at domain.com/blog, make sure you use the leading slash
baseurl: "/blog"
```

[Source](https://stackoverflow.com/a/61342972)

I found that you must provide a blank `baseurl` rather than omitting the property because Jekyll would reuse my `url` for my `baseurl` for the `absolute_url` filter, which would not result in a valid resource URL.

## RSS Post Notifications

[I've written about the struggles of trying to do post notifications on your site without a server before]({% post_url 2023-07-13-Choosing-A-Delivery-Mechanism %}), and how I didn't want to set up a newsletter. While I still stand by this decision, I understand that some people want to be notified of a site's posts without relying on getting a text. After a couple months went by, I was reading [Jake Weidokal's article about post notifications](https://weidok.al/blog/post-notifications) where I learned about FeedRabbit, a service that allows people to receive email post notifications via RSS. Since I'm using GitHub Pages, I don’t have access to a server for doing notifications, so this is a good method for people to use if they want to receive post notifications from me.

## My `feed.xslt.xml`

You can view my full stylesheet [here](https://github.com/reesdraminski/reesdraminski.github.io/blob/master/feed.xslt.xml), but I wanted to include my changes to the pretty-feed stylesheet here for your reading convenience.

I added a section about FeedRabbit:
```html
 <nav class="container-md px-3 mt-md-5 markdown-body">
    <p class="bg-yellow-light ml-n1 px-1 py-1">
        <strong>This is a web feed,</strong> also known as an RSS feed. <strong>Subscribe</strong> by copying the URL from the address bar into your newsreader.
    </p>

    <p class="text-gray">
        Visit <a href="https://aboutfeeds.com">About Feeds</a> to learn about how to get started with newsreaders and subscribing.
    </p>

    <p class="text-gray">
        If you don't want to get into newsreader apps, you can try using <a href="https://feedrabbit.com/">FeedRabbit</a> to get RSS post notifications sent to your email.
    </p>
</nav>
```

Then I also added a category field in the feed preview section:
```xml
<xsl:for-each select="/atom:feed/atom:entry">
    <div class="pb-3">
        <h3 class="mb-0">
            <a target="_blank">
                <xsl:attribute name="href">
                    <xsl:value-of select="atom:link/@href"/>
                </xsl:attribute>
                <xsl:value-of select="atom:title"/>
            </a>
        </h3>

        <p class="mb-0">
            Category: <xsl:value-of select="atom:category/@term"/>
        </p>

        <small class="text-gray">
            Published: <xsl:value-of select="substring(atom:updated, 0, 11)" />
        </small>
    </div>
</xsl:for-each>
```