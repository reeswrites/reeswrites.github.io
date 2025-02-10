---
layout: post
tags:
- Computer Science Education
title: A Mental Model of Programming as Data Manipulation
slug: mental-model-of-programming
description: A model for understanding computation that is good for beginners or people
  who are looking to learn program without too much Computer Science theory.
type: article
---

## Background

This article is about mental model that I developed for beginners to better understand what programming is and how to use it to accomplish a goal. Put very simply: we use programming languages to get data and manipulate it in some way. I think this model gets to some theoretical computation stuff like [Turing machines](https://www.cl.cam.ac.uk/projects/raspberrypi/tutorials/turing-machine/one.html), but at the heart it is a very utilitarian model of computing. User interfaces is something that is quite irrelevant to this model, and I wouldn’t say that it disproves the model, but I think that some stretching would have to be done to make it fit. I think it is not the stretchiest of stretches, but still it is beyond the scope of the current article.

This is a way of thinking about computing and modeling it in your brain, but it is not a way of solving problems with computing. That kind of algorithmic decomposition is beyond the scope of this model, however you can read [my other article about it]({% post_url 2023-08-24-Programming-Patterns %}). I think that while separate, these models would be symbiotic because you would break down problems into sub-problems and think about how to solve those sub-problems by way of data manipulation.

This is only one out of infinite possible mental models because there are unlimited ways that one could conceive of programming. This is just a singular lens that could be used to glean understanding. While it works for me, it might not work for everyone. I think that a lot of the development of this model has to do with influence from Turing and also that fact that I do a lot of data engineering at work.

I am proposing this model because I think it very quickly motivates why you should learn how to program and how to structure curriculum around the central idea of data and data manipulation. I think that this role definitely leads to a more data science, machine learning, or data engineering role, but I don't think that should discourage someone from learning to use this mental model. I think that having a couple of mental models that one could switch on/off in their heads could be really useful. I think of it like a Swiss Army Knife, where you have a couple of mental models that you can choose to use depending on the problem/project.

In the space below I propose some ways to slice up programming concepts for curriculum based on the idea of Data vs Manipulation, and then I have a third category called Program Flow for things that I thought were important but didn't quite fit nicely into the two categories.

## Data 

Data are facts or values that convey information about something.

Programming Concepts:
* Variables
    * Arrays
    * Dictionaries
    * Primitives
        * String
        * Integer
        * Float
        * Boolean
* Data Representation
    * Types
        * Booleans
        * Integers vs Floating Point Numbers
        * Characters vs Strings
* Data Formats
    * JSON
    * CSV
    * Binary vs ASCII

## Manipulation

Manipulation is the act of transforming data into something else. This could be converting data types, creating analysis out of data, or aggregating data.

Programming Concepts:
* Assignment
* Arithmetic Operators
* Arithmetic Assignment Operators
* Casting/Data Type Conversion
* JSON Parsing/String-ifying
* Functions
    * Functions could be in program flow or data manipulation because sometimes functions are used solely as a way to reuse code, but other times you are using it to manipulate data.
* Map, Reduce, Filter, Find, Sort

## Program Flow

Program flow is a weird third category that I initially didn’t want, but I think that it is a good middle catch all that is a place for things that don’t quite fit into the dichotomy of Data vs Manipulation. Really at the heart of it all, this is ways to facilitate manipulation, but is not in and of itself manipulating the data really.

Programming Concepts:
* Conditionals
* Loops
* Try/Catch
* Ternary Operator