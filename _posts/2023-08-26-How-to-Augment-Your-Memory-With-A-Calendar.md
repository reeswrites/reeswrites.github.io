---
layout: article
tags:
- Maintaining a Second Brain
- Calendars
title: How to Augment Your Memory With A Calendar
slug: memory-calendar
description: A way to use your calendar to store temporal information for easy lookup
  and analysis later.
category: Garden
---

## Background

I am a person who is known among my friends both as a person who doesn't have a very good autobiographical memory, as well as a person who uses their calendar almost too obsessively. These two things of course, are linked. I think that most people don't remember how they spend their days, I am just especially bad at it. Fast forward to me starting college, I started using Google Calendar religiously as a way to keep track of all my classes and extracurricular involvement. Then I began to start having to plan out times to hang out with friends further in advance, which meant that I started putting social events in my calendar as well. This eventually snowballed into me keeping track of all the times that I hung out with people on my calendar. I also wanted to keep track of my media consumption, so I would input when I was reading, watching TV, watching YouTube, etc. Now at present I basically keep track of anything in my calendar that I want to remember doing.

In this article, I will describe my method, which is all about capturing the 5 W’s: Who, What, When, Where, and Why. I will talk about my notational system to make inputting and parsing calendar events easier and more efficient, and my reasoning behind those decisions. My hope in writing this article is that it will encourage or inspire some people to implement similar strategies.

## Who

Ahead of time I try to write down all of the people who I know or think will get there. Then when the event happens, I make sure to mark down all the attendees of the event. This also pushes me to really try to get people’s names and spell them correctly. Depending on how accurate you want your timekeeping to be, you may have to split one event into various events because there will be people who come late and/or leave early. If you store a person as having been at the event the whole time, you may end up overstating how much time you spend with that person. This is of particular import if you plan on doing some kind of programatic data analysis of your calendar because it will cause your analysis to be incorrect due to incorrect data being inputted.

The way I denote hanging out with someone is `“hang w/ name, name & name”`. I use the ampersand in particular because the "+" sign has a different meaning in my calendar notation. It doesn't really matter what you do, as long as you are consistent because this way it is easy to parse programmatically.

A lot of times when you hang out with someone, you say, “Wow, I feel like it’s been forever. How long has it been since we’ve last seen each other?” The other person would inevitably say something like, “Yeah, I’m not sure, but yes, it definitely has been too long.” Whereas for me, I keep track of who I’ve spent time with in the past on my calendar, so I am able to say, “Wow, you’re right it’s been two months since we’ve last seen each other, we need to be better and try at least for once a month.” Having that data makes it more tangible and actionable in my opinion. Time has a way of slipping away from us if we aren’t too careful.

## What

I usually am not specific in the event title, but instead leave most of the elaboration for the event summary/details section. However, for activities that happen fairly frequently or is a category that I want to track at a finer grained level, I will use that instead. For hanging out with friends, I will typically just say `hang` but if we are going out to a bar I might say `drink`. For watching stuff I have `watch youtube`, `watch anime`, and `watch tv`, where I'll put the title of the show in parentheses for future reference. It is just easier to see things at a glance, and also programmatically parse. If I am doing two activities at the same time or same time block I might put `eat + watch youtube` so I have a better understanding of what I was doing then. 

## When

Inputting events ahead of time is good for planning, and inputting events as or after they've happened is good for remembering. Calendars are often used for time planning and forward looking thinking, but you can use calendars just as effectively to see how you spend your time.

If you want to make it easy for yourself to input events into your calendar, track on a 15-minute increment. On Apple you can actually do it to the 5-minute increment, but you have to go into the event edit view. Google defaults to a 15-minute increment as well, but you can actually enter in an arbitrary time value, but only on their web app.

## Where

I put the address (try to include the name of the location too if Maps has it). This helps me remember what restaurants I’ve gone to for instance, but I find it is most handy in allowing to have a history of my friends’ addresses. I would highly recommend that you just put the address in the person’s contact, but that is only their current address, and doesn’t hold any kind of history. Calendar's these days can also notify you when it is time to leave based on current traffic conditions which is really helpful if you struggle being on time.

## Why

I don’t have a specific method for this in my calendar system, but I usually use the event summary/details section as a catch-all. In particular, I use it as a place to hold my reflections or impressions. This is a great way to do more contextual journaling. instead of having a big dump at the end of the day into one page you could dump into different events or update the events as they happen depending on your style.