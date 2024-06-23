---
layout: post
tags:
- Jekyll
title: Creating a Flexible Permalinking System in Jekyll
slug: flexible-permalinking-jekyll
description: How to create and maintain a flexible permalinking system in Jekyll for
  your posts.
started_at: '2023-12-26 10:28:00'
category: Posts
type: article
---

## Background

One of the greatest pleasures of building out a blog is being able to link back to your older articles when writing new ones. However just as you grow as a writer, your blog and organization system will grow too. This means that sometimes articles will change titles, categories, tags, or get deleted. Luckily, Jekyll has a way to get links to other posts. 

When I was first building out my blog I did not have the foresight to create a flexible linking system for permalinking to content. This wouldn't be a problem if my blog never changed, but the way that I organize my content evolved organically as I started to add more of it under various new types. I previously had all my articles under `/writing`, but when I wanted to have a Writing sub-menu on my navbar, I knew that I wanted to change it to `/articles`. With a well laid out standard for linking this wouldn't have been a problem, but it was for me because I was hardcoding permalinks in my post frontmatter, as well as statically linking to articles instead of using Jekyll's `post_url` filter.

In this article I will detail the steps that you can take in starting out your Jekyll-powered blog to avoid the missteps that cost me a lot of time and effort in refactoring. If you use all of these techniques together what you have is category agnostic linking. You can change the category name of something for example and it will all regenerate itself with very little other manual changes for you.

## Creating a Permalink

The first and easiest thing that you want to do is to set a [global permalink](https://jekyllrb.com/docs/permalinks/#global). The format will vary depending on your needs, but I think that `/:categories/:title/` is a sensible pattern, and is the one that I employ. However this is built on the assumption that you will never have two articles with the same title in the same categories, so if this does not hold true for you, I would suggest that you add the post date in the permalink.

The next part is arguably the most important part: the URL slug. This is the last part of the URL that uniquely identifies a page, which in most global permalinks is the title. It is important to note that in Jekyll using the `:title` parameter utilizes the title in the file name and not the title set in the frontmatter. Depending on your file naming system and preferred URL conventions, you might find it acceptable to just use the file name as the slug. However if you want to shorten the URL slug to be an abbreviated version of the title, you need to set the `slug` parameter in the frontmatter, like so:

```yaml
---
layout: article
categories: Articles
tags: ["Beer"]
title: "I Drank 1,000 Beers!"
slug: 1000-beers
description: "Analyzing my Untappd data after trying 1,000 unique beers."
---
```

There is a `permalink` attribute in the frontmatter that you can set, but I would highly advise against it because that would mean that you are hardcoding the category into the permalink, which means that it might take a lot of manual effort in case you ever want to change it in the future.

You can link to posts that you’ve published by using the `post_url` filter like this: `{%raw%}{% post_url 2022-01-19-article-title %}{%endraw%}` which will [generate the correct permalink URL for the post](https://jekyllrb.com/docs/liquid/tags/#linking-to-posts). Regardless of whether you use the file name for the slug or not, Jekyll uses the file name for post linking with the `post_url` filter. This means that your file naming convention is actually very important and something that you should decide on before you start your blog.

## File Naming Methods

There are competing priorities you have to choose from when creating a file naming convention for your Jekyll posts.
* Stability: How much the file name changes
* Evocativity: How much the file name conveys about the file contents
* Consistency: How much the file name matches details in reality (production/published environment)

I would reckon that there are infinitely many different ways to name your files, but I am unsure how effective each of those methods would be in balancing the above priorities. Here I will detail a few methods that came to me after a bit of reflection and that I think are worth mentioning, sometimes if only to highlight the cons of the approach.

**Filename = URL Slug (Evocativity: High, Consistency: High, Stability: Low):** This method is nice because you don't have to mess with the `slug` parameter in the frontmatter because the filename be the exact URL slug that you want for the post. However, to me this method doesn't make much sense because whether you used the `post_url` filter or not, every URL change would require you to update the link reference, making it almost better to have just linked to the post via the URL slug. I suppose you would get the added benefit of Jekyll yelling at you for using an outdated link reference, but I'm not sure how highly I value this.

**Filename = Category + Tags (Evocativity: Low-Medium, Consistency: High, Stability: High):** In this method if you have an article  about trains, you would have the file name as something such as: 2022-10-29-article-trains. This is more stable than the title because while writing an article the title may change many times, but it is less likely for the category/tags to change. However, the downside of this stability is the fact that it is less evocative; you have the tag to go on, but that's about it. A modified version would be to add some topic noun to the end of the filename that is more indicative of the file content, but even still I am skeptical about the actual utility of this method.

**Filename = Title (Evocativity: Medium-High, Consistency: Low-High, Stability: Low-High):** This method is evocative because the title is probably the most informative token for indicating file contents. If you don't rename your files a lot or ever, then this method is also stable. However, if you do tend to update titles, you could simply modify the frontmatter `title` parameter instead of the filename. In this way, the evocativity of the file name is a bit diminished, but in return you get more stability. This loss of evocativity leads to a case of something called name drift, where the file name is different than the display name and could get confusing for you. This is abstracted away from the user so they won’t know anything, but it more matters for you as the editor of the content. 

I implicitly chose this method when I started this blog, but this system works for me. While my file names and display titles don't entirely match up, I would much prefer that than having to update `post_url` backlinks every time I want to adjust a title. My titles are usually small iterations and are still evocative, but your mileage may vary.