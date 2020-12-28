---
layout: project
title: Interactive Video Cards
categories: [Projects, TeCanal]
repo_name: "tecanal/interactive-video-cards"
---

A JavaScript API to create interactive cards that will play at certain video timestamps and augment the viewing experience.

During the COVID-19 pandemic, the Board of Directors and I, alongside some Executive Officers, tried to envision what online STEM educational outreach would look for us. Synchronous learning via Zoom was something that did not seem incredibly feasible for us because many of the people that we serve do not have steady Internet connections or robust cellular data plans. 

The idea then was to create interactive videos that would have term definitions, quizzes, and other ways to engage the students while watching videos about various STEM activities that TeCanal would produce, or that could be sourced from online. I rapidly prototyped the idea and received some very positive feedback to the project, but ultimately it was decided that we didn't have the people-power to develop content and deliver it.

One obstacle that I ran into was where the videos would actually be hosted. All of TeCanal's web infrastructure was on GitHub, so everything was served through GitHub's servers. This is great for static content, but heavy files like video content was gonna be a struggle, especially because large binary files aren't really well-suited for GitHub, save for GitHub LFS. YouTube would have been the prime hosting service, except for YouTube has a very weird embed system that is done via iFrame's, which don't really play well with the &lt;video> tag that I was using to do video playback.

This prototype is fully usable and deployable as is, but there are still a number of quiz types that could have been added, and other user experience enhancements (especially in regards to video seeking) could be implemented as well.