---
layout: post
tags:
- Jekyll
title: Search with SimpleJekyllSearch
slug: search-with-simplejekyllsearch
redirect_from: /garden/search-with-simplejekyllsearch/
description: My modifications to Jake Lee's configuration of SimpleJekyllSearch to
  fit my Digital Garden.
started_at: '2024-04-11 09:20:00'
type: article
---

## Background

About a month ago I knew that I wanted to add search functionality to my Digital Garden somehow. In researching, I found Gaurav Trivedi's [article about implementing Simple Jekyll Search](https://beingtechnicalwriter.com/jekyllsearch/) which first put me on to Christian Fei's [SimpleJekyllSearch JavaScript library](https://github.com/christian-fei/Simple-Jekyll-Search). It was exactly what I was looking for, but it didn't have everything that I needed. I don't really remember how but I was able to find Jake Lee's article about [how he was using SimpleJekyllSearch](https://blog.jakelee.co.uk/using-simplejekyllsearch-for-easy-and-quick-site-search/) which really tied it all together for me because it provided a great foundation for using the templating and sorting middleware.

## My Implementation

I use Jake's setup of the templating and sorting middleware, and only made minor changes except for one large one to the templating. The minor changes included modifying the classes to fit within Bootstrap's and my own naming conventions, switching the search input from type="text" to type="search", adding a debounce time, and changing `searchResultTemplate` to be a multi-line template string for easier reading.

The larger templating change was because I knew that I didn't want to show the Jekyll excerpt of the post like he was doing, but rather an excerpt of the content surrounding the matched search term. Excerpts are good at providing context for the article itself, but I wanted to provide context for the occurence of the search term within the post to better help searchers.

My excerpt algorithm is roughly as follows:
1. Find first occurrence
2. Find the start of substring
    1. Start with 120 characters before first occurrence
    2. If substring start is not content start and we are not after a space, backtrack until whole word shows
3. Find the end of substring
    1. Start with 120 characters after the first occurrence
    2. If substring end is not content end and we are not before a space, go forward until whole word shows

The word cut-off prevention algorithm is maybe not as elegant as I think it could be, but it will never loop that much so I'm not super worried about performance costs.
```js
// .toLowerCase() both streings makes indexOf case-insensitive
const firstOccurrence = value.toLowerCase().indexOf(
    document.getElementById("searchInput").value.toLowerCase()
);

// 120 chars is roughly 1-2 sentences
let start = firstOccurrence - 120;

// cannot have negative start for substring
if (start < 0)
{
    start = 0;
}
// if non-beginning start, backtrack until whole word shows
else
{
    // go until we hit the beginning of content or a word spacing
    while (start > 0 && value[start - 1] != " ")
    {
        start--;
    }
}
```

A few notes about my implementation:
* SimpleJekyllSearch's search is case-insensitive by default (don't quote me if I'm wrong though), so I had to make the first occurrence searching case-insensitive as well.
* `indexOf()` just grabs the first occurrence of the search term but that’s fine with me. It would be interesting to try to show all instances of the search term, but I don't see much utility in that for my website.
* I wanted to inline the JSON that SimpleJekyllSearch uses to search, but it made the document pretty heavy because of full text of articles was > 1MB. I decided to just accept the network request approach because search is not worth longer page load. I would rather only the search functionality be delayed rather than the entire page.
* The word cut-off prevention algorithm checks for a space because that is a word boundary, but it means that it will catch punctuation. This isn't the end of the world, but can look ugly next to the ellipses.
* I didn't show the forward tracking algorithm for finding the `end` of the substring, but that is just the `start` algorithm but reversed
* The default results `limit` is 10 which is sensible for not showing a massive amount of results, but I found that it wouldn't yield the best results because it seemed like it would find 10 results and stop searching. This favors the first entries in your `search.json` file which is something to note. I think the reason that this happens is because the search results are found then probably what happens is only the limited results are passed to the sort middleware.
    * I just set my `limit` to 100 but I think the least hacky way would be to set limit to the number of posts you have.
    * I also set a `max-height` and `overflow-y: scroll` on the searchresults div just so that it doesn't make the page super long when it does inevitably have a lot of search results
    * Make sure you have `debounce` set to something reasonable (I just did 100ms) because otherwise you are going to get crazy number of results for a full text search with a query of "e" or something

## Potential Future Improvements

Just like Jake notes in his article, I wish I could figure out a way to only match full instances of the search term. I understand the utility of partial matching, but it leads to unintuitive search results most times. I think I could use the `sortMiddleware` to calculate the "fullness" of the match to try to at the very least relegate partial matches to lower in the search rankings.

My Digital Garden is relatively small now, but as it grows I do worry about how long the search results may get. This would be a great use case for pagination of the search results, but I'm not sure how involved it would be for the actual utility. Bootstrap has a pagination component that would work for the occasion, but I would still have to figure out the JavaScript for it.

I may try to create a new search engine eventually because of my problems with search seemingly stopping prematurely, but for now it works well enough for me.