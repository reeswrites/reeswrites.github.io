---
layout: post
type: article
tags:
- IndieWeb/Meta-blogging
- '2026'
title: Overhauling Garden Search
slug: overhauling-garden-search
description: A look at how I worked over two years to improve content search and discovery
  interactivity in my digital garden on this site.
started_at: '2026-03-31 10:46:00'
publish_datetime: '2026-03-31T21:47:46-04:00'
---

My [Digital Garden](/posts/all), to me, is the ultimate culmination of my blog, so I always wanted it to be visually appealing but also interactive so that people can explore and find interesting information for themselves.

[I added SimpleJekyllSearch in early 2024 which I modified to add search excerpts]({% post_url 2024-04-12-Search-with-SimpleJekyllSearch %}). However over time I realized that didn’t want search results to be its own element, I wanted search to filter the garden cards in real time. This was on my backlog for a long time because I had no real idea on how to implement it and it wasn’t like it needed to be done right away. This is how it almost took me two years to implement this vision (2024-04-11 - 2026-03-29). And it's still not done! I will continue to tweak it probably for as long as I have this site, but in the meantime, I am very happy with where search is right now.

By adding post type and tag filtering in mid-to-late 2024 and iterating on it over almost two years, I slowly refactored the code and added more interactivity. I think this strong base of functions in my codebase put be in a good position to utilize an LLM to help me. This task was also a good candidate for outsourcing to AI for me because it was a result that I wanted, but one that I wasn’t necessarily excited to think about and implement. It took some prompting, but otherwise I was generally impressed by Claude’s ability to stick to my coding standards and implement the search filtering. There are some implementation quirks but nothing that would impede by ability to debug the code later if I find any bugs or want to extend or modify the implementation somehow.

The post filtering logic was far simpler than I would have thought, really it was just another `.filter()` call and a new `.sort()` call.

```js
const filteredPosts = posts
    .filter(post =>
        globalFilters.types.length === 0 || 
        globalFilters.types.includes(post.type)
    )
    .filter(post =>
        globalFilters.tags.length === 0 ||
        post.tags
            .map(x => x.toLowerCase())
            .some(tag => globalFilters.tags.includes(tag))
    )
    .filter(post => {
        if (!query) return true;
        return (
            post.title.toLowerCase().includes(query)       ||
            post.description.toLowerCase().includes(query) ||
            post.tags.some(t => t.toLowerCase().includes(query)) ||
            post.content.toLowerCase().includes(query)
        );
    })
    .sort((a, b) => {
        if (globalSortMode === "relevance" && query) {
            const diff = scorePost(b, query) - scorePost(a, query);
            return diff !== 0 ? diff : b.date - a.date;
        }
        return b.date - a.date;
    });
```

The scoring scheme was something that Claude did entirely itself; I had no input and I may tweak it in the future, but it seems good enough for now.

```js
/**
 * Score a post against the search query for relevance sorting.
 *
 * Tiers:
 *   Title exact match          +1000
 *   Title starts with query    +500
 *   Title contains query       +200  (per occurrence)
 *   Tag exact match            +150  (per tag)
 *   Tag contains query         +75   (per tag)
 *   Description contains query +40   (per occurrence)
 *   Content contains query     +10   (per occurrence, capped at +100)
 */
function scorePost(post, query) {
    if (!query) return 0;

    const q  = query.toLowerCase();
    const re = new RegExp(escapeRegex(q), "g");
    let score = 0;

    const title = post.title.toLowerCase();
    if (title === q)               
        score += 1000;
    else if (title.startsWith(q)) 
        score += 500;

    score += ((title.match(re) || []).length) * 200;

    post.tags.forEach(tag => {
        const t = tag.toLowerCase();
        if (t === q)
            score += 150;
        else if (t.includes(q)) 
            score += 75;
    });

    score += ((post.description.toLowerCase().match(re) || []).length) * 40;
    score += Math.min(((post.content.toLowerCase().match(re) || []).length) * 10, 100);

    return score;
}
```

I also wanted to display matched text in title, type, or tags as well, not just in post content via the excerpt. This was something that wasn't present in SimpleJekyllSearch and that I had no idea how to implement in my own code. What Claude ended up doing was generating highlighted HTML via RegEx string replacement and dropping that in where there were matches. For example: 
```js
const tagSpan = createElement(p, "span", {
    class: "badge bg-secondary me-1 text-start",
    innerHTML: query
        ? highlight(titleCase(tag), query)
        : escapeHtml(titleCase(tag)),
    style: "cursor: pointer; text-wrap: auto;",
    title: `Filter to ${tag} posts`,
    onclick: () => toggleFilter("tags", tag)
});
```

Looking at it now, I feel silly for thinking it was such a large task, but it's partially because of all my tags changes that I did over time. I also let it torture me on my TODO list because I didn't have any implementation ideas in my head and would not sit down to think about how implementation might be done. 

Funny enough, it actually takes less LOC to do search this way because we don’t have to use SJS anymore, which was a some library code and a bit of customization of top of it. SJS isn’t even maintained anymore so that was also a potential issue. In this way, we actually reduced complexity a little bit! The code for the digital garden is still a mess, but it gets the job done and that's good enough for me right now.