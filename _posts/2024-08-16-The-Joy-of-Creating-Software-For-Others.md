---
layout: post
type: essay
tags:
- Software Engineering
- Loving Better
- '2024'
title: The Joy of Creating Software For Others
slug: joy-creating-software-for-others
description: An essay about the joy of creating software for others and the love that
  it takes to make great software.
started_at: '2024-08-11 09:41:00'
---

There's a quote I think a lot about by Sarah Ruhl in her play *The Clean House*:
> There once was a very great American surgeon named Halsted. He was married to a nurse. He loved her-- immeasurably. One day Halsted noticed that his wife's hands were chapped and red when she came back from surgery. And so he invented rubber gloves. For her. It is one of the great love stories in medicine. The difference between inspired medicine and uninspired medicine is love.

> When I met Ana, I knew:  
I loved her to the point of invention.

I think the idea of loving to the point of invention is so beautiful because it is the idea of seeing someone; what they are struggling with or what could make their day better, and taking all the steps to remediate it. It’s like having a muse but deeper than that because you are impassioned to create for a specific person in mind.

For some reason, it doesn't read like a grand gesture to me, but it really is when you think about it because of the amount of attention, time, and other resources that you have poured into this creation in order to bring it to existence for the other person.

"I love you, look at what I made for you. You matter to me. I see you."

--- 

I believe that great software is created for people. It can be [for yourself]({% post_url 2023-08-25-Own-Your-Tools %}) or for others, but it has to be for someone particular in mind. This is why User Experience Designers created the idea of [User Personas](https://www.interaction-design.org/literature/article/personas-why-and-how-you-should-use-them); to better understand and think of the people who will use their software.

Furthermore, I feel like users can feel it when something is made out of love. 
* [Wordle was created for the developer's partner](https://www.nytimes.com/2022/01/03/technology/wordle-word-game-creator.html) because of her love for word games
* [Locket](https://www.fastcompany.com/90818702/how-locket-a-widget-built-by-a-guy-as-a-gift-to-his-girlfriend-became-an-apple-app-store-award-winner) was created as a way for the developer to keep in touch with his partner
* The basis of [ElasticSearch](https://devm.io/databases/elasticsearch-founder-interview-112677) was worked out when the creator wanted to create a cooking app for his wife who wanted to become a chef (Thanks Ben for telling me this!)

I don't think that it is a coincidence that these apps filled a genuine need and were so well-designed and well-received by people. 

“I love you, look at what I made for you. You matter to me. I see you.”

---

While I was dating someone in the past, they were a huge Taylor Swift fan, one that could almost always correctly guess which Taylor song was playing just by the first few seconds. They were endlessly enthralled by the challenge, which made me want to create a game out of guessing lyrics that they could play on their own or with friends.

I felt uniquely qualified to make this game because it combined a number of different skills/projects that I had developed over the years. I had created a lyrics scraper before as well as worked on minimal web applications, so I felt like it was a perfect convergence of my skills and interests to make this game.

It definitely wasn't an easy project, I had to:
1. Use the [Genius API](https://docs.genius.com/) to get all songs by a particular artist along with album name and cover art metadata 
2. Use the [lyrics-finder](https://www.npmjs.com/package/lyrics-finder) package to get lyrics for each of the songs
3. Create a webapp that can load and display all the data
4. Make it pretty (enough) and easy/fun to use

The app is small (~200 lines of HTML, CSS, and JS combined) and really doesn't do much. It more so operates as a random lyric fragment viewer (you can choose to view all lyrics too), but it allows you to hide the song data (album cover, title, and album) so that it can operate as a game. 

It doesn't keep score, there's no timer, and there isn't any color in the UI. However, it does all that it needed to do, allow someone to guess the Taylor Swift song from just a random lyric fragment.

Even when the app caused me some frustration when things didn't work during development, I enjoyed the entire process because I knew that person I was making it for would enjoy it. Even if I am no longer dating that person, I am glad to have made something that could be an enduring artifact of that period of our relationship.

There is a possibility that there is an app somewhere out there that does something similar to my app, but it wouldn't have meant the same if I hadn't made it. I liken it to making a [home-cooked meal](https://www.robinsloan.com/notes/home-cooked-app/). It's like making a lasagna or something else with lots of different components from scratch. These apps are a labor of love, but that's what makes them more meaningful.

“I love you, look at what I made for you. You matter to me. I see you.”