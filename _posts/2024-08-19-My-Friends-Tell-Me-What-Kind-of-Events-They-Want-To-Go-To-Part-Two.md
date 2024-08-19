---
layout: post
type: article
category: Posts
tags: ["Hosting"]
title: "I Surveyed My Friends' Event Preferences - Part 2"
slug: friends-event-preferences-part-two
description: "Analysis of event preference survey results in regards to event type."
started_at: "2024-08-14 08:10:00"
---

## Introduction

In [Part One]({% post_url 2024-08-15-My-Friends-Tell-Me-What-Kind-of-Events-They-Want-To-Go-To-Part-One %}) of surveying my friends' event preferences I focused on event pricing, size, and timing. This part will focus on the kinds of events that they would be interested in attending.

My main takeaway is that most people are open to all types of events. They may not actually RSVP to them, but in theory they are not opposed. You should plan and invite and let people choose to come or not. People come to events to have fun so as long as you explain what the event is someone can assess whether or not they think they will have fun.

## Crafting Events

### Are you interested in crafting events?

<div id="craftingInterest" style="height: 400px;"></div>

### What kind of craft events would you be interested in?

<div id="craftingEvents" style="height: 400px;"></div>

### Reflection 

* Other:
    * crochet/knitting/just co-crafting everyone brings their own project
    * Pottery/clay
    * mosaics

## Watching Events

### Would you be interested in watch party events?

<div id="watchingInterest" style="height: 400px;"></div>

### What kind of watch party events would you be interested in?

<div id="watchingEvents" style="height: 400px;"></div>

### Reflection

* Movies/shows would be voted on by the attendees ahead of time most likely
* I was surprised that so many people were interested in watch party events to be quite honest

## Cooking Events

### Would you be interested in cooking-based events?

<div id="cookingInterest" style="height: 400px;"></div>

### What kind of cooking-based events would you be interested in?

<div id="cookingEvents" style="height: 400px;"></div>

### Reflections

* For people with dietary restrictions and who don't like to cook it makes sense why these events wouldn't be as fun
* These events give attendees the opportunity to potentially learn a new skill

## Eating Events

### Would you be interested in eating-based events?

<div id="eatingInterest" style="height: 400px;"></div>

### What kind of eating-based events would you be interested in?

<div id="eatingEvents" style="height: 400px;"></div>

### Reflections

* You get a meal with other people so makes sense why I lot of people said Yes to this type of event
* Other:
    * Happy hours
    * Trivia (at a bar/restaurant)

## Gaming Events

### Would you be interested in game nights?

<div id="gamingInterest" style="height: 400px;"></div>

### What kind of game nights would you be interested in?

<div id="gamingEvents" style="height: 400px;"></div>

### Reflections

* Video Games = LAN Party/Split Screen
* Card Games =  Poker, Uno, etc.
* Party Games = Charades, Werewolf, etc.
* I thought video games would be more niche but a decent amount of people chose it, friends are nerds

## Miscellaneous

### Would you be interested in any of the following miscellaneous event concepts?

<div id="miscInterest" style="height: 400px;"></div>

### Reflections

* Item Exchange = Book/Clothes/Plant/Games
* Other:
    * Hiking
    * Disc Golf
    * Some kind of outdoor group activities
* [Silent Book Club](https://silentbook.club)

<script src="https://unpkg.com/rough-viz@2.0.5" defer></script>
<script>
    const fillColor = "#467537";

    window.addEventListener('DOMContentLoaded', () => {
        new roughViz.BarH({
            element: "#craftingInterest",
            title: "",
            data: {
                "labels": [
                    "Yes",
                    "Maybe"
                ],
                "values": [
                    16,
                    11
                ]
            },
            margin: { top: 50, left: 50, right: 50, bottom: 50 },
            fillStyle: "solid",
            roughness: 2,
            color: fillColor
        });

        new roughViz.BarH({
            element: "#craftingEvents",
            title: "",
            data: {
                "labels": [
                    "Bookmark Making",
                    "Letter Writing",
                    "Scrapbooking",
                    "Bracelet Making",
                    "Free Painting",
                    "Guided Painting",
                    "Ring Making",
                    "Other"
                ],
                "values": [
                    14,
                    7,
                    15,
                    13,
                    18,
                    20,
                    13,
                    3
                ]
            },
            margin: { top: 50, left: 200, right: 50, bottom: 50 },
            fillStyle: "solid",
            roughness: 2,
            color: fillColor
        });

        new roughViz.BarH({
            element: "#watchingInterest",
            title: "",
            data: {
                "labels": [
                    "Yes",
                    "Maybe"
                ],
                "values": [
                    22,
                    5
                ]
            },
            margin: { top: 50, left: 50, right: 50, bottom: 50 },
            fillStyle: "solid",
            roughness: 2,
            color: fillColor
        });

        new roughViz.BarH({
            element: "#watchingEvents",
            title: "",
            data: {
                "labels": [
                    "Currently Airing Reality Show ",
                    "Movies",
                    "Previously Aired Show",
                    "Currently Airing Show",
                    "The debate",
                    "E-Sport Games",
                    "Sport Games",
                    "Documentaries"
                ],
                "values": [
                    15,
                    24,
                    18,
                    19,
                    1,
                    8,
                    12,
                    1,
                    1,
                    1
                ]
            },
            margin: { top: 50, left: 200, right: 50, bottom: 50 },
            fillStyle: "solid",
            roughness: 2,
            color: fillColor
        });

        new roughViz.BarH({
            element: "#cookingInterest",
            title: "",
            data: {
                "labels": [
                    "Yes",
                    "Maybe",
                    "No"
                ],
                "values": [
                    20,
                    5,
                    2
                ]
            },
            margin: { top: 50, left: 50, right: 50, bottom: 50 },
            fillStyle: "solid",
            roughness: 2,
            color: fillColor
        });

        new roughViz.BarH({
            element: "#cookingEvents",
            title: "",
            data: {
                "labels": [
                    "Build-Your-Own Pizza",
                    "Pancake/Waffle Making",
                    "Cookie/Cake Decorating",
                    "Dumpling Making",
                    "Pasta from Scratch",
                    "anything vegannnn"
                ],
                "values": [
                    18,
                    12,
                    16,
                    20,
                    16,
                    1
                ]
            },
            margin: { top: 50, left: 200, right: 50, bottom: 50 },
            fillStyle: "solid",
            roughness: 2,
            color: fillColor
        });

        new roughViz.BarH({
            element: "#eatingInterest",
            title: "",
            data: {
                "labels": [
                    "Yes",
                    "Maybe",
                    "No"
                ],
                "values": [
                    23,
                    3,
                    1
                ]
            },
            margin: { top: 50, left: 50, right: 50, bottom: 50 },
            fillStyle: "solid",
            roughness: 2,
            color: fillColor
        });

        new roughViz.BarH({
            element: "#eatingEvents",
            title: "",
            data: {
                "labels": [
                    "Dinner Potluck",
                    "Prix Fixe Dinner",
                    "Brunch Potluck",
                    "Prix Fixe Brunch",
                    "Other"
                ],
                "values": [
                    23,
                    19,
                    20,
                    17,
                    1
                ]
            },
            margin: { top: 50, left: 200, right: 50, bottom: 50 },
            fillStyle: "solid",
            roughness: 2,
            color: fillColor
        });

        new roughViz.BarH({
            element: "#gamingInterest",
            title: "",
            data: {
                "labels": [
                    "Yes",
                    "Maybe"
                ],
                "values": [
                    24,
                    3
                ]
            },
            margin: { top: 50, left: 50, right: 50, bottom: 50 },
            fillStyle: "solid",
            roughness: 2,
            color: fillColor
        });

        new roughViz.BarH({
            element: "#gamingEvents",
            title: "",
            data: {
                "labels": [
                    "Board Games",
                    "Card Games",
                    "Party Games",
                    "Video Games"
                ],
                "values": [
                    23,
                    22,
                    17,
                    17
                ]
            },
            margin: { top: 50, left: 100, right: 50, bottom: 50 },
            fillStyle: "solid",
            roughness: 2,
            color: fillColor
        });

        new roughViz.BarH({
            element: "#miscInterest",
            title: "",
            data: {
                "labels": [
                    "Item Exchange",
                    "Bring a Friend Party",
                    "Co-Working Cafe",
                    "Salon/Presentation Night",
                    "Silent Reading Club",
                    "Speed Friending/Speed Dating",
                    "None of the above",
                    "Other"
                ],
                "values": [
                    17,
                    16,
                    14,
                    14,
                    8,
                    15,
                    2,
                    1
                ]
            },
            margin: { top: 50, left: 200, right: 50, bottom: 50 },
            fillStyle: "solid",
            roughness: 2,
            color: fillColor
        });
    });
</script>