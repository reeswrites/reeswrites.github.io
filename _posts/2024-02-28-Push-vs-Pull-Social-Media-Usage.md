---
layout: article
tags:
- Social Media
title: Push vs Pull Social Media Usage
slug: push-pull-social-media
description: Applying polling vs event driven systems architecture concepts to social
  media usage.
started_at: '2024-02-27 17:00:00'
category: Garden
---

Social feeds are posts of information, but can also be thought of as events à la Computer Science. With these concepts in mind, we can then apply the notions of [polling vs event driven systems architecture](https://www.softwarepragmatism.com/polling-event-driven). In polling you make a request to receive data, whereas in an event-driven system the data will be pushed to the receiver.

Polling is the traditional way of interacting with social feeds which is done via pulling to refresh the feed for new posts. This is bad for two reasons:
1. This mechanism has been [compared to slot machines](https://www.theguardian.com/technology/2018/may/08/social-media-copies-gambling-methods-to-create-psychological-cravings) in the past and is designed in such a way to keep you hooked.
2. If no new posts from people you actually care about are there, the platform will push ads or other content for you to look at instead. All of this just to have you be on the platform longer so that they can serve you more ads or surveil you longer.

What I think would be better is opting in to post/story notifications for all the people that you care about on whatever social media platforms that they use. This is definitely annoying to set up, but it’s a one-time setup effort so the cost is pretty much zero amortized in the long run. As a result of this, your notification center becomes the feed rather than the apps themselves. In a way we are [exapting](https://www.sciencedirect.com/science/article/abs/pii/S0169534713001407) post notifications. 

Something to note is that since that this isn't the intended use of the technology there are some technical limitations. 
1. Instagram's post notifications have not always been reliable for me. [Instagram uses Machine Learning to decision push notifications](https://engineering.fb.com/2022/10/31/ml-applications/instagram-notification-management-machine-learning/), so that might be the reason why I don't always receive notifications.
2. Rebooting your phone usually clears notifications
3. Some notifications are more glanceable than others
    * Twitter shows the text of the tweet and image on long press of notification, but YouTube or Instagram (stories) doesn't have anything like that