---
layout: project
title: Parsons2Play
categories: Projects
repo_name: "reesdraminski/parsons2play"
---

A Parson's Puzzles platform mixed with the ideas of Program2Play built on top of [Mosaic](/writing/Mosaic/).

**Program2Play:**  
Evelyn Stiller. 2017. Program2Play: enticing underrepresented groups to program through gameplay. J. Comput. Sci. Coll. 32, 6 (June 2017), 69–78.

View the website [here](http://www.program2play.com/).

**Parson's Puzzles/js-parsons:**  
Petri Ihantola, Ville Karavirta (2011). Two-Dimensional Parson’s Puzzles: The Concept, Tools, and First Observations. Journal of Information Technology Education: Innovations in Practice, 10, pp. 1–14.

View the website [here](https://js-parsons.github.io/).

## Why did I create this project?
I created this project after I read saw the Program2Play poster as seen for the online 2020 SIGCSE conference. I thought that it was a really interesting method to increase student motivation and engagement for coding tasks.

## Implementation Details
For the blocks, I used jQuery UI because they have a sortable element that can be "connected" with other sortable elements. This means that the lines can be interchanged between the "Block Bank" and "Solution" sections. I use CodeMirror's ```runMode()``` function for syntax highlighting within blocks, something that I think is missing from all the Parson's Puzzle platforms that I've encountered. I also used jQuery Resizable to make a resizable split panel view so that the user can resize to focus on the blocks or the game better whenever they want.

## Novelty
Upon looking though Program2Play, I thought that Parson's Puzzles would be a good match for it to make it more structured. In this way, while Stiller's Program2Play is more oriented towards learning, while my implementation is more towards practice.

The user interface is much more modern than what Program2Play has, and the implementation seems to be ultimately easier than whatever plugin js-parsons was trying to create. In this project, I believe I have established that it is possible to create a Parson's Puzzle platform rather easily with off-the-shelf frameworks (for JavaScript at least).

Additionally, my project is built on top of Mosaic, another project I have created for learning JavaScript. It provides an API to manipulate pixel art, which is great for animations and games. This provides the basis for the games that the user is able to play once they have completed the Parson's Puzzle.

## Potential Future Work
* Add more games
* Add incorrect blocks that will not be used in a puzzle solve
* Show indentation