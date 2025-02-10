---
layout: project
title: Hack Check
repo_name: reesdraminski/hack-check
type: project
---

## Inspiration
It all started when I came into HackUMBC yesterday, and I had to stand in a long line in order to get registered. It was a hackathon with some of the brightest minds in attendance, there had to be a better way right? Thus, HackCheck was born, a QR-based badging system that assigns each person a unique ID and QR Code that allows organizers to check them in, mark them as having eaten a meal, or mark attendance of workshops.

## What it does
Each QR code takes you to a user profile page which is marked by the registrant's unique UID. If you are a regular attendee, you will be able to see their name, and if their privacy settings permit it, their school and email. If you are a hackathon volunteer/organizer (which can be determined by a device fingerprint database), you will be able to check them in, mark them as having eaten a meal, give them a t-shirt, or check them into a workshop.

## How I built it
I used the normal webapp languages of HTML, CSS, and JS. For JavaScript, I used the AngularFire database, which allowed me to have two-way bindings that allowed for 1:1 interaction with Angular Form Components and my Firebase database. I used Fingerprint.js by Valve to determine user fingerprints that organizers enroll so that they can have access to admin tools.

## Challenges I ran into
A big challenge I ran into was trying to make a good user interface. I knew that this tool was going to be used almost exclusively on mobile, so I had to make a responsive platform, but also that showed a lot of data in the least overwhelming way possible.

## Accomplishments that I'm proud of
The accomplishment I'm proud of is that every thing is live updating. If for some reason two organizers are accessing the same attendee's data at the same time, if one makes a change, it'll show up on the other's screen.

## What I learned
I learned more about Angular Scope, and when it updates. A huge problem I ran into was when my bindings weren't updating when the user was found to have an enrolled device, so I discovered the $scope.$apply() function, and just what it did, and how it saved me!

## What's next for HackCheck
I really want to gamify and social network the hackathon experience with HackCheck. There would be achievements and badges that show up on the attendee's profile, and when another attendee scans their badge, they would be able to see their achievements, and information about their project.