---
description: Why LLMs aren’t funny and the possible future of play
layout: post
links:
  citations: []
  external:
  - title: Justin Tiehen, LLMs Lack a Theory of Mind and so Can't Perform Speech Acts--A
      Causal Argument - PhilArchive
    url: https://philarchive.org/rec/TIELLA-2
  - title: Making sure you're not a bot!
    url: https://journals.publishing.umich.edu/ergo/article/id/7960/
  - title: Why LLMs (still) lack taste - Beyond the Prior
    url: https://beyondtheprior.com/post/why-llms-lack-taste/
  - title: Philosophy of Humor (Stanford Encyclopedia of Philosophy)
    url: https://plato.stanford.edu/entries/humor/
  - title: The Death of Prompt Engineering, And How Evals Are Rising in Its Place
      | by Yahav M | Bootcamp | Medium
    url: https://medium.com/design-bootcamp/the-death-of-prompt-engineering-and-how-evals-are-rising-in-its-place-f8467871a815
  - title: ''
    url: https://dl.acm.org/doi/10.1145/3778357
  - title: Who's Laughing Now? An Overview of Computational Humour Generation and
      Explanation
    url: https://arxiv.org/html/2509.21175v1
  - title: 'Timing is Everything: Temporal Scaffolding of Semantic Surprise in Humor'
    url: https://arxiv.org/html/2605.00143
  - title: Testing Humor Theory Using Word and Sentence Embeddings - ACL Anthology
    url: https://aclanthology.org/2025.chum-1.6/
  - title: "A Comprehensive Guide to LLM Temperature \U0001F525\U0001F321️ | by Kelsey
      Wang | Medium"
    url: https://medium.com/@kelseyywang/a-comprehensive-guide-to-llm-temperature-%EF%B8%8F-363a40bbc91f
  - title: NeurIPS Poster Multi-turn Reinforcement Learning with Preference Human
      Feedback
    url: https://neurips.cc/virtual/2024/poster/93434
  - title: 'Jokes: Philosophical Thoughts on Joking Matters, Cohen'
    url: https://press.uchicago.edu/ucp/books/book/chicago/J/bo3613669.html
  - title: 'Wisecracks: Humor and Morality in Everyday Life, Shoemaker'
    url: https://press.uchicago.edu/ucp/books/book/chicago/W/bo213636907.html
  - title: Riffing is Human Nature
    url: https://reeswrites.com/posts/riffing-is-human-nature/
  - title: Comedic Sparring
    url: https://reeswrites.com/posts/comedic-sparring/
  - title: A nice surprise? Predictive processing and the active pursuit of novelty
      | Phenomenology and the Cognitive Sciences | Springer Nature Link
    url: https://link.springer.com/article/10.1007/s11097-017-9525-z
  internal: []
slug: llms-humor-play
tags:
- Humor
- Artificial Intelligence
- '2026'
title: LLMs, Humor & Play
type: essay
---

Can an LLM write a joke? Well yes and no. Many people argue if an LLM can really do perform [speech acts](https://philarchive.org/rec/TIELLA-2) like [assertion](https://journals.publishing.umich.edu/ergo/article/id/7960/) because there is no intentionality and/or Theory of Mind behind its output. So if a joke is something created in order to make someone laugh, the LLM would have to understand and intend that, which many critics would rightfully argue that it’s unable to do so, at the very least right now. However in a purely formal way, yes it can output something that looks like a joke (but still [lacking something like taste](https://beyondtheprior.com/post/why-llms-lack-taste/)), which can even make you laugh (although I cannot find any randomized control human-judge trial of human vs LLM generated jokes).

The next question that we then have to ask if “What makes something funny?” There are a [lot of competing theories](https://plato.stanford.edu/entries/humor/), but ultimately (to me) what is funny is whatever makes you laugh<sup><a href="#footnote-anchor-1">1</a></sup>. So really, by evaluating it (subconsciously perhaps) and finding something funny *makes it funny*. This means that humor may be fundamentally goal-oriented, to make you laugh. But what makes you laugh? Can we measure that? This is where (formal) evals come in.

What are evals and why are they important?

> “Evals are, at their core, systematic methods for measuring whether your AI system is doing what you want it to do. They answer questions like: Is the model’s output accurate? Is it consistent? Does it stay within the guardrails you set? Does it degrade when the input changes slightly? Is it getting better or worse as you iterate on your system?”
> 
> [The Death of Prompt Engineering, And How Evals Are Rising in Its Place](https://medium.com/design-bootcamp/the-death-of-prompt-engineering-and-how-evals-are-rising-in-its-place-f8467871a815) by Yahav M

You may already be able to see how they could be helpful, but they become incredibly important in autonomous agentic systems. Evals are necessary for loops, for a system to get to a goal, it must be able to experiment and measure the outcomes of the various things that it tries in order to move closer to achieving its set goal. The creator of OpenClaw, a popular open-source autonomous agent, talking about loops which started discourse™:

![](https://substack-post-media.s3.amazonaws.com/public/images/8b9e60e6-6142-4d3e-abd4-60d7f2238d21_1162x526.png)

The lack of humor evals is not for lack of trying. There is a branch of (computational) linguistics called computational humor that seeks to [understand](https://dl.acm.org/doi/10.1145/3778357) as well as [generate](https://arxiv.org/html/2509.21175v1) humorous content. Maybe its [timing](https://arxiv.org/html/2605.00143) or [semantic distance](https://aclanthology.org/2025.chum-1.6/). Of course in reality, it’s probably a mixture of a ton of different things, and while I am fascinated by this line of questioning in this sub-field, I do think that it quickly starts to miss the point. To what end is it to generate jokes? To say that we could? Humor is a puzzle, and jokes are little conceptual puzzles unto themselves, so I guess there will always be people who are fascinated by trying to crack them.

Let’s say for the sake of the argument that a formal eval for humor is found and is able to be employed in an agentic loop. What would happen? There would be individual differences in jokes because of [temperature](https://medium.com/@kelseyywang/a-comprehensive-guide-to-llm-temperature-%EF%B8%8F-363a40bbc91f) causing non-determinism in the outputs, but otherwise I feel like you would start to see certain themes arise. Maybe through frequency of appearance in training data, or by [RLHF](https://neurips.cc/virtual/2024/poster/93434), without prompting it at the beginning with the skeleton or general premise of a joke, we would land on some kind of statically average joke (maybe a knock-knock joke). Now wouldn’t that be funny?

At the center of this is all is the question “What makes humor fun to consume and participate in?” In Ted Cohen’s book, *[Jokes: Philosophical Thoughts on Joking Matters](https://press.uchicago.edu/ucp/books/book/chicago/J/bo3613669.html),* he talks about how jokes by nature require a shared understanding of things in order for them to work, so there is a certain kind of intimacy shared by the joke teller and the joke listener. In David Shoemaker’s book, *[Wisecracks: Humor and Morality in Everyday Life](https://press.uchicago.edu/ucp/books/book/chicago/W/bo213636907.html),* he talks about the incredibly important role of interpersonal humor and how we relate to and play with each other. Think about [riffing with your buddies](https://reeswrites.com/posts/riffing-is-human-nature/) or [comedically sparring with them](https://reeswrites.com/posts/comedic-sparring/).

To participate in humor is perhaps to play with a quirk of human evolution; using language to exploit a quirk of [predictive processing](https://link.springer.com/article/10.1007/s11097-017-9525-z). But we do play with non-human agents, like playing fetch with your dog, so who’s to say that it always has to be human-to-human play. What if beyond working with LLMs, we might play with them in the future?<sup><a href="#footnote-anchor-2">2</a></sup> While LLMs right now are too RLHF’d to be an assistant that its humor abilities are constrained by its own professionalism, there is no guarantee that’s what it will be like that forever. What might it look like to you riffed or run bits with/on Claude? Is this good for humanity? Bad? More advanced AI and chatbots opens up novel and unexpected ways of interacting with LLMs, and it is our responsibility as people to think through the potential consequences.

#### Footnotes

[1](#footnote-anchor-1)

<div id="footnote-anchor-1">
My true opinion is more nuanced than this because laughter can “misfire” at things that aren’t funny/meant to be funny and are actually quite serious. However for the sake of this argument I think it is fine enough.
</div>

[2](#footnote-anchor-2)

I need to think more about this and if it is good for humanity or not. I think that if we open up another entire paradigm of interacting with LLMs beyond work (I think that romantic chatbots are still in this work mode of emotional labor and sycophancy) that AI will only become more entrenched in (certain people’s) lives. Whether this is a good thing or a bad thing is up to other thinkers, but also only time will be able to tell. We are not soothsayers.