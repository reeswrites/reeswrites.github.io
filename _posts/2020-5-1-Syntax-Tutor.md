---
layout: project
title: Syntax Tutor
repo_name: reesdraminski/syntax-tutor
type: project
category: community-project
---

Syntax Tutor is a game to help students recognize incorrect syntax and practice writing code in correct syntax.

### Game Flow
1. The user is shown a piece of code, and the user is asked, "Is this correct syntax?"
2. The user has two actions, they can either press the "Yes" or the "No" button.
    * If the code is correct, and the user says that the code is correct, they get points.
    * If the code is correct, and the user says that the code is incorrect, they get deducted points, and have to retry the problem with the same code.
    * If the code is incorrect, and the user says that the code is correct, they get deducted points, and have to retry the problem with the same code.
    * If the code is incorrect, and the user says that the code is incorrect, a code editor appears, and they must fix the syntax of the code to make it correct.
        * If the code they enter is correct, they get awarded points for solving the problem.
        * If the code they enter is incorrect, they get deducted points and have to continue to try editing the same code until it is correct.
3. This process repeats infinitely and a running total of the score is kept.

In this way, the student practices recognizing incorrect syntax, but also practices writing correct syntax as well.

If the user only wants/needs to practice a particular skill, there is a series of checkboxes in the footer that allows the user to toggle certain problem types.

This game is intended to be used as a way to transition between a block-based and a text-based language to facilitate typing practice. It can also be used for targeted practice to train syntax rules into a student's muscle memory.

As of right now, the proof of concept (PoC) only supports JavaScript syntax, but it could be easily extended for a variety of languages. Any other languages (with the exception of Python because of [Skulpt](https://skulpt.org/)) would need the parse the syntax tree in order to check syntax correctness. This PoC uses the easy way out and executes user-entered JavaScript to check if it runs without errors to check user-entered code correctness.