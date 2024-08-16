---
layout: post
type: article
category: Posts
tags: ["Hosting"]
title: "I Surveyed My Friends' Event Preferences - Part 1"
slug: friends-event-preferences-part-one
description: "Analysis of event preference survey results in regards to event pricing and timing, primarily."
started_at: "2024-08-14 08:10:00"
---

## Background

I think that hosting is so important to our social fabric and I also think that it is a skill that everyone can learn and be good at.
* Further Reading: [Hosting For Emerging Adults](/anthologies/hosting-for-emerging-adults)

I've hosted events before and I enjoy hosting, but for planning I would typically just ask a friend or two if they think its a good idea, or just host it because I think it would be fun. This worked for a while, but it also meant that if I wasn't struck with inspiration for an event then I wouldn't be planning/hosting. In an effort to avoid this kinds of hosting dry spells, I wanted to ask my friends what kind of events they would want to go to so that I could fulfill those wants.

If you send a survey to your friends, not everyone will fill it out, but a good amount will! So if you find yourself not believing the survey results, try it with your own group of friends! I think that having this kind of data is invaluable for anyone who wants to throw fun, memorable, and engaging events for their friends and/or community.

## Sample Details

* 27 total responses
* A lot of my friends in the area are people I've met at work, so we mostly have similar income and job stresses since we mostly are Software Engineers at the same company
* 2/3 men
* Most people are 24 years old, everyone is 23 - 28, so mostly Gen Z

All of these definitely skew the results so just keep the sample details in mind.

## Why do you want to go to events?

<div id="whyGoToEvents" style="max-width: 800px; height: 400px; margin-right: auto; margin-left: auto;"></div>

### Reflection

* This section was multiple choice so it is interesting to see what people chose 
    * Having fun being the top was something that I didn't expect but I guess it is a bit of a secondary effect from meeting new people, experiencing new things, etc.
    * Meeting new people is top of mind for me so sometimes I forget that other people don't share that desire
* I stuck "Learn something new" in as a proxy for interest in a information/learning/discussion based event which I knew wouldn't be everyone's cup of tea, but I was surprised that as many people checked that box
* Write-ins: to spend time with (specific) friends
    * Some friends are harder to see or you only know them tangentially through another person so its not at the level to hang out with them yet

## Event Pricing

### Are you okay with paying for events to cover material costs?

No graph needed for this one because only one respondent said that they wouldn't be okay with paying for events to cover material costs.

### Would you be less likely to go to an event if it costs money?

<div id="costAffectingAttendance" style="max-width: 800px; height: 400px; margin-right: auto; margin-left: auto;"></div>

### Reflection

* I should have asked what a reasonable price for an event was but it does really matter of what the event is for material costs and the value it provides the attendees so not sure if the data would have been good anyway.
* I was surprised that most people were willing to pay.
    * I think people generally have an understanding that hosting can be costly, but also that people value events and are willing to pay to a degree.
    * A lot of times its still cheaper to going to a restaurant or an event hosted by some other place.
* Other = "Depends on the price" and "I feel like $10-$15 is a reasonable amount (depending on the event ofc)"

## Event Timing

### What days for events would you realistically attend?

<div id="dayAttendance" style="max-width: 800px; height: 400px; margin-right: auto; margin-left: auto;"></div>

### Would you generally prefer weekday or weekend events?

<div id="weekdayEndAttendance" style="max-width: 800px; height: 400px; margin-right: auto; margin-left: auto;"></div>

### What is the earliest weekday start time for an event that you find acceptable?

<div id="earliestWeekdayStart" style="max-width: 800px; height: 400px; margin-right: auto; margin-left: auto;"></div>

### What is the latest weekday end time for an event that you find acceptable?

<div id="latestWeekdayEnd" style="max-width: 800px; height: 400px; margin-right: auto; margin-left: auto;"></div>

### What is the earliest weekend start time for an event that you find acceptable?

<div id="earliestWeekendStart" style="max-width: 800px; height: 400px; margin-right: auto; margin-left: auto;"></div>

### What is the latest weekend end time for an event that you find acceptable?

<div id="latestWeekendEnd" style="max-width: 800px; height: 400px; margin-right: auto; margin-left: auto;"></div>

### Reflection

* I thought it was interesting that no one preferred solely weekday events, but it wasn't really all that surprising. I was however surprised how many people were open to weekday events.
* I don't really consider Friday a part of the weekend, but it makes sense why someone would want to do an event after work when they don't have work the next day.
    * For many it’s a work from home day so they might want to get out of the house.
* The times of week day events didn’t really surprise me.
* I should’ve asked for event length but it doesn’t really matter to me because one of my house rules is that you can come and leave whenever.
* Event times end times are definitely related to bed times and event start times are probably related to meal times, i.e. dinner for weekdays.

<script src="https://unpkg.com/rough-viz@2.0.5" defer></script>
<script>
    const fillColor = "#467537";

    window.addEventListener('DOMContentLoaded', () => {
        new roughViz.BarH({
            element: "#whyGoToEvents",
            title: "",
            data: {
                labels: [
                    "Have fun",
                    "Meet new people",
                    "Experience new things",
                    "Learn something new",
                    "Have interesting conversations",
                    "Get out of the house"
                ],
                values: [
                    19 + 7,
                    13 + 4,
                    12 + 7,
                    11 + 5,
                    13 + 5,
                    15 + 6
                ]
            },
            margin: { top: 50, left: 200, right: 50, bottom: 50 },
            fillStyle: "solid",
            roughness: 2,
            color: fillColor
        });

        new roughViz.BarH({
            element: "#costAffectingAttendance",
            title: "",
            data: {
                labels: [
                    "Significantly less likely",
                    "Slightly less likely",
                    "Maybe",
                    "Only a little",
                    "Wouldn't affect my decision",
                    "Other"
                ],
                values: [
                    2 + 0,
                    1 + 2,
                    1 + 0,
                    7 + 4,
                    7 + 1,
                    2 + 0
                ]
            },
            margin: { top: 50, left: 200, right: 50, bottom: 50 },
            fillStyle: "solid",
            roughness: 2,
            color: fillColor
        });

        new roughViz.BarH({
            element: "#dayAttendance",
            title: "",
            data: {
                labels: [
                    "Monday",
                    "Tuesday",
                    "Wednesday",
                    "Thursday",
                    "Friday",
                    "Saturday",
                    "Sunday",
                ],
                values: [
                    9 + 1,
                    10 + 2,
                    11 + 1,
                    13 + 3,
                    18 + 7,
                    19 + 7,
                    14 + 5
                ]
            },
            margin: { top: 50, left: 100, right: 50, bottom: 50 },
            fillStyle: "solid",
            roughness: 2,
            color: fillColor
        });

        new roughViz.BarH({
            element: "#weekdayEndAttendance",
            title: "",
            data: {
                labels: [
                    "Weekday",
                    "Prefer weekday, but weekend is fine",
                    "Weekend",
                    "Prefer weekend, but weekday is fine",
                    "Either is fine"
                ],
                values: [
                    0 + 0,
                    4 + 1,
                    1 + 1,
                    6 + 4,
                    9 + 1
                ]
            },
            margin: { top: 50, left: 250, right: 50, bottom: 50 },
            fillStyle: "solid",
            roughness: 2,
            color: fillColor
        });

        new roughViz.BarH({
            element: "#earliestWeekdayStart",
            title: "",
            data: {
                labels: [
                    "12:00-12:30am",
                    "3:00-3:30pm",
                    "5:00-5:30pm",
                    "6:00-6:30pm",
                    "7:00-7:30pm"
                ],
                values: [
                    1 + 0,
                    0 + 1,
                    6 + 2,
                    10 + 4,
                    3 + 0
                ]
            },
            margin: { top: 50, left: 150, right: 50, bottom: 50 },
            fillStyle: "solid",
            roughness: 2,
            color: fillColor
        });

        new roughViz.BarH({
            element: "#latestWeekdayEnd",
            title: "",
            data: {
                labels: [
                    "8:00-8:30pm",
                    "9:00-9:30pm",
                    "10:00-10:45pm",
                    "11:00-11:30pm",
                    "12:00-12:30am"
                ],
                values: [
                    3 + 0,
                    2 + 1,
                    5 + 4,
                    6 + 0,
                    4 + 2,
                ]
            },
            margin: { top: 50, left: 150, right: 50, bottom: 50 },
            fillStyle: "solid",
            roughness: 2,
            color: fillColor
        });

        new roughViz.BarH({
            element: "#earliestWeekendStart",
            title: "",
            data: {
                labels: [
                    "12:00-12:30am",
                    "8:00-8:30am",
                    "9:00-9:30am",
                    "10:00-10:30am",
                    "11:00-11:30am",
                    "12:00-12:30pm",
                    "1:00-1:30pm",
                    "2:00-2:30pm",
                ],
                values: [
                    1 + 0,
                    3 + 0,
                    1 + 1,
                    3 + 4,
                    6 + 1,
                    2 + 1,
                    3 + 0,
                    1 + 0
                ]
            },
            margin: { top: 50, left: 150, right: 50, bottom: 50 },
            fillStyle: "solid",
            roughness: 2,
            color: fillColor
        });

        new roughViz.BarH({
            element: "#latestWeekendEnd",
            title: "",
            data: {
                labels: [
                    "8:00-8:30pm",
                    "9:00-9:30pm",
                    "10:00-10:45pm",
                    "11:00-11:59pm",
                    "12:00-12:30am",
                    "1:00-1:30am",
                    "2:00-2:30am",
                    "3:00-3:30am",
                ],
                values: [
                    1 + 0,
                    1 + 0,
                    1 + 0,
                    3 + 1,
                    8 + 2,
                    3 + 1,
                    3 + 2,
                    0 + 1
                ]
            },
            margin: { top: 50, left: 150, right: 50, bottom: 50 },
            fillStyle: "solid",
            roughness: 2,
            color: fillColor
        });
    });
</script>