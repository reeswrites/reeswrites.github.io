---
layout: post
tags:
- Jekyll
title: Post and Author Age Without Plugins
slug: post-and-author-age
description: How to display post and author age in Jekyll via JavaScript.
started_at: '2023-08-29 17:16:00'
type: article
---

## Background

It started out as simply wanting to display the date the post was published, which is a [very simple task in Jekyll](https://www.webisland.agency/blog/how-to-format-dates-in-jekyll/). This led me to think about showing the post age because I think it would be interesting to me to see how old one of my articles is without requiring the reader to do any kind of math. Then I got to thinking about contextualizing the time in my life where I was writing these articles, and how it would be pretty easy to calculate my age alongside the post age. Displaying these two ages together is something unique to my blog (at least I think so since I haven't seen it anywhere else) and something that is really more done for me than for the reader. I think that it is personally interesting to be able to see what time in my life I was in when I was writing these articles.

## Doing it in Liquid

At first I did it in Liquid, which was a doozy because of how verbose you have to be to do anything remotely complex. I ended up settling on this solution, which maybe isn't the prettiest, but it gets the job done:

{% raw %}
```liquid
{% assign secondsInHour = 60 | times: 60 %}
{% assign secondsInDay = secondsInHour | times: 24 %}
{% assign secondsInMonth = secondsInDay | times: 30 %}
{% assign secondsInYear = secondsInMonth | times: 12 %}

{% assign secondsSincePost = today | minus: post_date %}

{% assign yearsSincePost = secondsSincePost | divided_by: secondsInYear %}
{{ yearsSincePost }} years,

{% assign leftoverSecondsFromYears = secondsSincePost | modulo: secondsInYear %}
{% assign monthsSincePost = leftoverSecondsFromYears | divided_by: secondsInMonth %}
{{ monthsSincePost }} months,
                       
{% assign secondsLeftoverFromMonths = leftoverSecondsFromYears | modulo: secondsInMonth %}
{% assign daysSincePost = secondsLeftoverFromMonths | divided_by: secondsInDay %}
{{ daysSincePost }} days, and

{% assign secondsLeftoverFromHours = secondsSincePost | modulo: secondsInDay %}
{% assign hoursSincePost = secondsLeftoverFromHours | divided_by: secondsInHour %}
{{ hoursSincePost }} hours
```
{% endraw %}

However this solution was short-lived because I realized that I shouldn’t be doing this in Liquid because Jekyll renders static files meaning that it would display from the time of the publish of the post to the last render, which is against what I wanted in the first place. 

## Doing it in JavaScript

You can see how the code placed is in relation to rest of my article template [here](https://github.com/reesdraminski/reesdraminski.github.io/blob/master/_layouts/writing.html).

{% raw %}
```html
<p style="margin-bottom: .5em">
    This article was published <span id="postedOn">{{post.date}}</span>, 
    which makes this post <span id="postAge"></span> 
    and me <span id="meAge"></span> old when I published it.
</p>
```

```javascript
// date constants
const postDate = new Date(`{{page.date | date: "%m/%d/%Y" }}`);
const startedAtDate = new Date("{{page.started_at}}");
const birthDate = new Date("July 9, 2000 17:00:00");
const today = new Date();

const options = {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
};

// https://stackoverflow.com/a/26064265
function calcDate(d1, d2) {
    let dy = d1.getYear()  - d2.getYear();
    let dm = d1.getMonth() - d2.getMonth();
    let dd = d1.getDate()  - d2.getDate();

    if (dd < 0) { dm -= 1; dd += 30; }
    if (dm < 0) { dy -= 1; dm += 12; }

    const yearUnit = dy == 1 ? "year" : "years";
    const monthUnit = dm == 1 ? "month" : "months";
    const dayUnit = dd == 1 ? "day" : "days";

    if (dy == 0)
    {
        if (dm == 0)
        {
            return `${dd} ${dayUnit}`;
        }
                    
        return `${dm} ${monthUnit} and ${dd} ${dayUnit}`;
    }

    return `${dy} ${yearUnit}, ${dm} ${monthUnit}, and ${dd} ${dayUnit}`;
}

// https://stackoverflow.com/questions/8215556/how-to-check-if-input-date-is-equal-to-todays-date
let postedOn;
if (today.setHours(0, 0, 0, 0) == postDate.setHours(0, 0, 0, 0))
{
    postedOn = "today";
    document.getElementById("postAge").innerText = "brand new";
}
else
{
    postedOn = `on ${postDate.toLocaleDateString("en-US", options)}`;
                
    document.getElementById("postAge").innerText = calcDate(today, postDate) + " old";
}

if (!isNaN(startedAtDate))
{
    document.getElementById("writingTimeP").style.display = "";
    document.getElementById("writingTime").innerText = calcDate(postDate, startedAtDate);
}

document.getElementById("meAge").innerText = calcDate(postDate, birthDate);
document.getElementById("postedOn").innerText = postedOn;
```
{% endraw %}

One issue I ran into during my implementation of this solution was that the Jekyll date with no filter was being output with timezone which Safari was failing to parse, while Chrome was fine. I tested on Brave (Chromium) so I didn't notice that [Safari parses dates differently](https://stackoverflow.com/questions/6427204/date-parsing-in-javascript-is-different-between-safari-and-chrome). I got around this by doing `page.date | date: "%m/%d/%Y"` so that it would only use the relevant Jekyll date information to create the Date object in JavaScript. This wasn't a difficult fix at all, I was just so confused what was going on while I was debugging.

## Potential Improvements

One potential improvement that I thought about was having the post age increase in real time. I would have done this by creating a JavaScript timer to increase the post age and re-render the post age text. It wouldn't be CPU intensive at all so it wouldn't affect page performance and I think it would be a cool statement animation. I ultimately decided against this because Jekyll has article post dates, but not post time. I could define something in the frontmatter, but I would have to make up times for publishing because that wasn't metadata that I preserved.