---
layout: project
title: hardModeCode
categories: community-project
repo_name: umbchackers/hardModeCode
---

A competitive code editing and execution environment where you cannot modify your code once you have entered it, if you mess up, you have to reset the editor contents.

## Why did I create this project?
I first came up with this idea while thinking of "facilitated shared experiences" for hackUMBC. I wanted to create more of a community feel that I think sometimes hackathons are lacking for various reasons. I was inspired by Minecraft Hardcore Mode, where if you die, the entire world is reset. From here, I thought it would be interesting to have a coding environment where if you make a typo, you have to restart.

## Implementation Details
In order to prevent the user from being able to edit their code, I restrict the following:  
* Mouse Clicks (mousedown event)
* Context Menu/Right Click Menu (contextmenu event)
* Backspace, Delete, and Any key combination that involves Cmd/Ctrl (keydown event)

This is against JavaScript best practices, but this is not an application for general users, so I was able to throw those right out the window.

For the problems, I decided to use beginner algorithm/data structures problems, similar to something you would see on HackerRank or CodingBat. I wanted the players to have to use their brains, but not just plan everything on paper and then type their code into the editor and submit it. I use Showdown to convert problem Markdown into HTML that details the problem prompt for the user.

Once the user submits their code, the backend server (written in Node.js) will create a file and run tests (via [Mocha](https://mochajs.org/)). I capture the output from the test framework and send it back to the client, with an additional boolean saying whether or not the user solved the problem. At the moment, there is no score being calculated, but it would ideally be a formula balancing the number of resets, number of lines, number of attempts, and time spent writing a correct solution.

## Future Work
* Client/server relationship so there can be a a game administrator
* Add support for C++, Java, and Python
* Add more problems
* Easy-to-deploy Docker container for the app
* Write a custom testing platform that works for all the languages and just tests output