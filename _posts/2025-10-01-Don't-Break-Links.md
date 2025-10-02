---
layout: post
type: article
tags:
- IndieWeb/Meta-blogging
- Jekyll
title: Don't Break Links
slug: dont-break-links
description: Why you shouldn't break links on your personal site and how to do redirects in Jekyll.
started_at: "2025-09-28 18:09:00"
---

Breaking links will cause [linkrot](https://en.wikipedia.org/wiki/Link_rot).
* If you are a blogger and want to protect from this you can link via The Wayback Machine, but this then doesn't give a link PageRank boost from Google if you are someone who cares about that kind of stuff.
    * I like using something like [Quotebacks](https://quotebacks.net/#about) and driving traffic to the original site/author, so I don't really do this a lot myself.

The best way to not break links is to not change your permalink structure.
* The best way to do this is to plan out your permalink structure ahead of time; simple and readable is usually better. 
    * I have an article that touches on this a bit [here]({% post_url 2024-01-06-Creating-a-Flexible-Linking-System-in-Jekyll %}).

If you do change, you should redirect to preserve old references as much as you can.
* If no one links to you but yourself then this is less of a problem, but how would you know?
    * If you can, you should definitely setup [WebMentions](https://indieweb.org/Webmention) which allows for "peer-to-peer comments, likes, reposts, and other responses across the web".
    * If you are on Google Search Console you can see what articles are linked to, or use Google with the `intext` search operator to look for links to your site.
        * This of course all depends on someone's personal site being indexed by Google, which not everyone wants or has setup.
* If you host your own server, you'll likely [do redirects in your .htaccess](https://help.dreamhost.com/hc/en-us/articles/215747748-How-can-I-redirect-and-rewrite-my-URLs-with-an-htaccess-file).
    * If you're using Jekyll like me, I will detail how I do it on my site below.
        
## Redirecting in Jekyll

I recently remembered that an article of mine was linked in another article about SimpleJekyllSearch, but under my old URL scheme. Luckily for me, it is a very easy task to get redirects working in Jekyll/GitHub Pages. All you have to do is include `jekyll-redirect-from` in your plugins list, as it is included in the GitHub Pages plugins list.

In your post frontmatter, you just need to add the redirect from old URL like so:
```yaml
layout: post
title: Search with SimpleJekyllSearch
slug: search-with-simplejekyllsearch
redirect_from: /garden/search-with-simplejekyllsearch/
```

It unfortunately doesn’t seem like you can use jekyll-redirect-from to create parameterized redirects like `/garden/:slug` to `/posts/:slug`. If you know how to do this then do let me know, but from what I’ve seen its mostly for one-offs. What you'll likely have to do is what [Jim did: write a script to create redirects for all your pages](https://blog.jim-nielsen.com/2018/url-design-and-automated-redirects-in-jekyll).