---
layout: project
title: Trace Tutor
categories: community-project
repo_name: "reesdraminski/trace-tutor"
---

A JavaScript implementation of Unlimited Trace Tutor by Qi, et al, which is an application that generates code tracing practice problems.

**The original paper:**  
Ruixiang Qi and Davide Fossati. 2020. Unlimited Trace Tutor: Learning Code Tracing With Automatically Generated Programs. In Proceedings of the 51st ACM Technical Symposium on Computer Science Education (SIGCSE ’20). Association for Computing Machinery, New York, NY, USA, 427–433. DOI: https://doi.org/10.1145/3328778.3366939

### Why did I create this project?
I created this project after I read the original paper as seen in the 2020 SIGCSE proceedings. I thought that it was a really cool solution to a problem that I had encountered when I was taking AP Computer Science A when I was in high school.

I had just come off of writing Syntax Tutor, so I was able to reuse a lot of the same code to make this application.

### Problem Generation
I generate problems by taking a blank loop header and generating random start, end, and step values. I make two strings, one of the code that is shown to the user, and one of the code where I replace console.log() with string concatenation. I do this because I create a JavaScript function object from that code and execute it to get the answer to the problem that was just generated. This is a very hacky way to solve this problem, because it is not easily extensible towards supporting other languages. It could support Python through [Skulpt](https://skulpt.org), but that's all I can think of without poking around online.

### Novelty Compared to Qi and Fossati
* Instead of using the Qi and Fossati's code generation method, I decided to use a lot of if statements, instead of changing a parse tree. I thought it would be easier to implement and also easier to read.
* The loop exercises that Qi and Fossati's code generates are different than mine which initialize a variable and mutate it and print at the end. Mine is more focused on indices.
* This is for JavaScript, while Qi and Fossati's is for Java.
* This is a web platform, while Qi and Fossati's is a Java application.

### Potential Future Work
* Add a recursion problem type
* Add division for loop problems
* Have more granular control over the types of loops (+, -, *, /)