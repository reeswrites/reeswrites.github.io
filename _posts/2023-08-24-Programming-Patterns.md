---
layout: post
tags:
- Computer Science Education
title: Programming "Patterns"
slug: programming-patterns
description: A practical model for algorithmic decomposition.
started_at: 13-05-2023 15:41:00
category: Posts
type: article
---

## Inspiration

One of my inspirations for this line of thinking was this video by John Fish about how he would learn to program if he had to start over. He talks a lot about how a lot of Computer Science and programming comes down to breaking larger problems into smaller ones. He goes on to say that with AI/LLMs, if you can understand this smaller problems and communicate them well, the LLM can help you. As long as you understand the core idea of breaking problems down (also known as algorithmic decomposition), then you should be able to make anything you want, given the time and energy.

<p>
    <iframe width="560" height="315" src="https://www.youtube-nocookie.com/embed/xxutllvXwaM?si=1wGKSVbgDbOLm043" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>
</p>

_The video by John Fish, a very interesting video that I highly recommend watching, its short too!_

Another inspiration was my own experience with teaching novice programmers in CMSC 201, which was Computer Science I for Majors at UMBC. As a UTA (Undergraduate Teaching Assistant), I found that a lot of students generally understood concepts in class, but were unable to apply them when it came to the bigger projects in class. I think there a lot of factors to this problem like unclear project documentation or asking first before trying to independently comprehend, but I think there is a larger factor at play as well. These students have realistically had very little instruction about how to solve problems, especially through the lens of programming.

As a result of these two things coming together in my mind, I wanted to develop a way of teaching the mindset of algorithmic decomposition. I don’t think that idea is anything revolutionary and lots of classes teach this method indirectly, but I think that there is power in directly trying to identify and directly teach what I am going to call "program patterns" or patterns for short. 

## Patterns as Solved Sub-Problems
Every problem can be broke down into manageable/meaningful sub-problems, we can call these sub-problems "patterns". They are abstract classes of problems, so for example, finding green colored objects vs blue colored objects would be the same problem of finding objects of a specified color. Sometimes there are subproblems that are unsolved, or there are different ways to solve it with differing pros and cons. This is seen sometimes in cloud architecture where there are a number of ways to solve something, but the cost or overhead might differ, so the "correct" solution varies situation to situation, if there is a "correct" solution at all.

These "patterns" are kind of like [software design patterns](https://refactoring.guru/design-patterns), and there is a conceptual overlap of sorts, but software design patterns can be adapted to solve many different problems, whereas these program patterns are specific solutions to a specific problem. Software design patterns are also designed for considerations of software developers/maintainers such as maintainability, comprehensibility, etc. Something like this might be the singleton design pattern which "restricts the instantiation of a class and ensures that only one instance of the class exists" and is "used for logging, drivers objects, caching, and thread pool" ([Digital Ocean](https://www.digitalocean.com/community/tutorials/java-singleton-design-pattern-best-practices-examples)).

## Value of Programming Patterns
Patterns are important because we can assign jargon or shorthand to the functionality we want to create.  If there are names of these kinds of patterns, it may help new programmers navigate and break down tasks better because it then becomes a recognition task rather than a logical task. Not that a novice programmer should spend their time rote memorizing pattern names and the associated code snippets, but rather having a faint idea of how to phrase a sub-problem is incredibly valuable, because then you can convey the information that you are looking for to other people or the Internet (or maybe even AI).

**Example Problem:** Given prices from different stores, find the cheapest item  
**Sub-Problem:** How to find a minimum value from a list

Teaching in the paradigm of programming patterns would be first focused on recognition, then recall. Something like combining computational thinking/algorithmic decomposition with matching it up to patterns. However, this is all building up to synthesis which would be algorithmic decomposition and abstract reasoning about patterns. We should teach Computer Science with word problems like how we already do it in math class. We would write small problems prompts and have the students break them down to see what patterns they would employ. I think that this could be a small group activity in a class, or it could be homework. It could even be a multiple choice question if you taught students a standard bank of sub-problems.

Below is a small example list that I quickly wrote out based on the things that I find myself doing in most of my programming, whether at work or in my free time. 

**Example Patterns:**
1. Finding a Value in an Unsorted Array
2. Finding a Value in a Sorted Array
3. Finding a Min/Max Value
4. Temp Values
5. Loop Sentinel
6. Taking User Input
7. Printing Something Out
8. Changing a Variable’s Value
9. Adding a Key to a Dictionary
10. Adding a Nested Key to a Dictionary
11. Generating a Random Number

A question that I am currently still thinking about is that finding the cheapest item is reducible to finding the minimum value, but are they one and the same, or just reducible? Does reducibility imply identicalness? Perhaps for this toy example it is obvious that finding the cheapest item *is* just finding the minimum, but for more complex problems, I am not sure if it would be so obvious. Another fun theoretical question floating through my mind is that there are different ways that students solve problems in code. This is in implementation and how different people have coding styles. However, at its core are the students all solving the same sub-problems, just expressed differently?

## Using Generative AI to Fill in the Patterns
This would be helpful for a new programmer learning how to code, or a programmer who is experience in one language and is trying to apply their knowledge in another language in a quick way. I would go out on a limb and say that for most basic programming patterns, a sophisticated enough LLM would be able to give you the correct answer at a high level of probability. I think that it would start to breakdown if you ask it a larger sub-problem because it wouldn't have the reasoning required to break down the problem into meaningful sub-problems. If an experienced programmer sees a quirk/mistake in the AI response, then they could just quickly right it or look it up on their own to check the AI's work. While current Generative AI can easily fill in patterns and generate valid snippets for solutions to sub-problems, I think explaining code or building a useful mental model for a beginner would be too big a task for current Generative AI.

Breaking things into manageable sub-problems are good for assistive Generative AI because because you are the synthesizer. You are one who is thinking of the big picture and just getting implementation details from the AI. I can easily see it becoming indispensable for people find themselves having to refresh themselves on syntax after they are revisiting a language or framework after a long time. You are having the AI implement something, and maybe you have to edit it to optimize for an edge case or fix a subtle mistake, but at the end of the day, you are still the programmer.