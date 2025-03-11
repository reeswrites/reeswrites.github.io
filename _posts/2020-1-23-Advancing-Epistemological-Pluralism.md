---
layout: post
title: Advancing Epistemological Pluralism Between Text and Block-Based Coding
type: project
tags:
- Computer Science Education
---

Epistemological Pluralism is a term that means "accepting the validity of multiple ways of knowing and thinking" [1]. Much like audiobooks to print books, Computer Science education currently perpetuates an (elitist) epistemology that views text as the highest form of programming. Block-based programming languages like Scratch, Snap, or Alice are typically reserved for introductory curriculum, with the goal at the end switching to a text-based language. In this paper I will argue that this should not be the case, and propose a new tool that would allow for industry adoption of a blocks-based coding environment.

## Introduction
Computer Science education currently perpetuates an (elitist) epistemology that states text as the highest form of programming. Block-based programming languages like Scratch, Snap, or Alice are typically reserved for introductory curriculum, with the goal at the end switching to a text-based language. We are world that values literacy, so it follows that most people would consider text to be the highest form. People similarly look down on audiobooks as opposed to print books, but there’s no real difference.

## Where Blocks Shine
Blocks are a very structured form of input and have a specific set of interactions that it can support. This unchanging structure allows for each block to be devoid of syntax errors, functionally eliminating an entire category of errors. Additionally, this structure makes it very extensible for accessibility purposes. With a few modifications, blocks-based environments could be accessible to more groups like Visually Impaired (Screen Reader Users), Manually Impaired (Eye Tracker Users) [2, 3]. Part of the reason why blocks-based programming is so looked down upon is because of its ease-of-use. It is incredibly easy for a new learner to pick it up and get the hang of coding with it. This is an incredible strength that should not be looked down upon, if you can create functioning code, then anything else is just unnecessary steps. Blocks also have built-in code discovery which can expose developers to more functions that they don't normally use. 

## Why the Hate?
In a lot of literature, blocks-based programming are referred to as “training wheels,” and as such should only be treated as scaffolding, a means to an end [4]. This is felt by the students, as well as shaped by their own perceptions, leading them to think or block programming as “inauthentic.” However, why can blocks-based programming not be the end goal? There are already code conversion systems that will take Blockly JavaScript code and output fully-functioning code. What different then is the final result between that and someone who typed it all out? Nothing. The only difference being how they got there. There are a few main criticisms that are often cited against block programming such as: the flexibility and speed of input as well as industry standards. 

## Code Viscosity
- Code Viscosity [Learnable Programming: Blocks and Beyond]
A major criticism of blocks is that it is not as fast nor as customizable as text-based programming. I disagree with this notion on two points. First off, just because the current block systems are not super advanced and customizable, does not mean they cannot or should not. They have been designed to fill a certain purpose as of right now, and complexity is something the designers have tried to avoid to make it an easy-to-enter educational tool. Secondly, there’s not overwhelming evidence to show that blocks-based programming is significantly slower than text-based languages. Even so, what about the metric of accuracy? It is impossible to make a syntax error in a blocks-based programming environment, whereas it’s very easy in a text-based one. Slow and steady usually wins the race, but is programming even a race? If you could specify a code standard into the block language design, it could be used to generate error-free, clean, and consistent code. This is an industry problem that could be in part helped by blocks-programming. 

## Industry Standards
Another major criticism of block programming is that it is not used in industry. While this may be true now, there’s no reason why it shouldn’t have to be that way. If there was a tool created that could convert existing codebases into blocks, it would be very easy for people to manipulate those blocks and then export it back into text. This would result in very little interruption to their normal code production workflow, and would them allow to be accepting of different programming modalities. A potential obstacle that could be encountered in attempting to enter the industry with a block-based programming would be technical interviews. They may have the same algorithmic thinking abilities as the next person, but usually interviewers want the interviewee express their answer as text on a whiteboard. This kind of problem could be alleviated if the interviewer allows pseudocode in the interview, but this varies on interviewer preference. This kind of isolation testing of a small part of someone's technical ability are immensely flawed, and technical interviews success rate very closely mirror the amount of privilege the interviewee has. It goes to show that the industry should reevaluate how they filter candidates and assess technical competence. 

## Balancing Tensions
Hybrid views of language input could allow the user to exploit both the features of a blocks-based and text-based environment [5]. 

## A New Tool
Taking all the previous ideas in this paper and putting them together, I am proposing an IDE that would allow a hybrid coding approach that could allow for text codebase importing and convert it into blocks. To aid this, it would be able to process imported modules and automatically create blocks for these functions complete with their docstrings to better allow library usage. The IDE would be very configurable so that the user could customize the colors, categories, shapes, and sizes of the blocks to allow for the best experience for each individual users. Furthermore, it would be architected to be extensible so that users can create their own plugins similar to how VSCode and Atom are as platforms. To better allow searching of code, you can click on a line of text and it will jump to the equivalent block in the other panel, in addition to using the classic Ctrl + F to find code in the text view will show corresponding code in the block view.

## Sources
1. [http://www.papert.org/articles/EpistemologicalPluralism.html](http://www.papert.org/articles/EpistemologicalPluralism.html)
2. [https://milnel2.github.io/files/Blocks4All.pdf](https://milnel2.github.io/files/Blocks4All.pdf)
3. [https://pdfs.semanticscholar.org/a795/7625d388fb52a0452853b1769e25122255a5.pdf](https://pdfs.semanticscholar.org/a795/7625d388fb52a0452853b1769e25122255a5.pdf)
4. [https://acbart.github.io/papers/blockpy-position-paper.pdf](https://acbart.github.io/papers/blockpy-position-paper.pdf)
5. [https://ieeexplore.ieee.org/document/8818762](https://ieeexplore.ieee.org/document/8818762)