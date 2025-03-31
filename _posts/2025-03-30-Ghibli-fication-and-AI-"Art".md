---
layout: post
type: stub
tags:
- Artificial Intelligence
title: Ghibli-fication and AI "Art"
slug: ghiblification-ai-art
description: A lot of so-called "AI Art" might be style transfer, which I argue is
  not art at all.
---

On the heels of a OpenAI's release of [GPT-4o Image Generation](https://openai.com/index/introducing-4o-image-generation/), there has been a [trend on X (née Twitter) where users "Ghibli-ify" an image](https://fortune.com/2025/03/27/chatgpt-studio-ghibli-hayao-miyazaki-openai-altman-copyright-lawsuit/). As with every Generative AI release, especially when it pertains to visual art, there was an immediate and immensely polarizing debate that followed about the morality and motivation around such acts.

To me the only real innovation is the multi-modal nature of the task, where you have a source image and you have a text prompt of what you want to happen to the image. Otherwise this is just [style transfer](https://en.wikipedia.org/wiki/Neural_style_transfer), which has been around for a long time. This is certainly an improvement on prior art in terms of stylization quality as well, but to me the only actual interesting part is that it can be applied and tweaked conversationally.

When the style transfer is applied thinly (with no direction or customization), it really is just a filter. The greatest modern example of filters is probably Instagram. There is some art in choosing an filter, but you aren’t taking a new photograph, instead it is in the [art of editing an existing photograph](https://www.reddit.com/r/photography/comments/hlxu4q/opinion_on_using_instagram_to_edit_and_filters/). I don't think that it is particularly good or innovative to just pick a filter and call it a day, but at least you are making some kind of intentional choice and relying on your own aesthetic sensibilities.

However with style transfer, it’s not only a filter, but a filter indicative of someone else’s visual style. You can see this done without AI with something like [Twilight’s color grading](https://prettycandypincompany.com/products/preorder-twilight-2008-keychain). It may look good but a lot of the actual heavy lifting is the fact that it looks like Twilight. The same goes for the Ghibli AI style transfer. [There is no intention of differentiation when using a filter]({% post_url 2023-06-23-AI-Art-and-the-Intention-of-Differentiation %}), you are literally trying to make one thing look like another thing. There is intention ("I want this to look like Studio Ghibli"), but no intentional creative choice. You choose the filter or style, but if you don’t tweak anything else, I do not believe that any art was created.

---

> Heavier speculation ahead!

A lot of people worry (rightfully so I think) that a lot of what happens in the background of Generative AI is something like style transfer when an image gets generated. At the very least it is pulling from the same well and I am unsure if there are specific pre-training or fine-tuning methods that would specifically allow us to differentiate and improve image generation in a multi-modal network. For what other reason does AI art look like that?
* [Why Does AI Art Look Like That? by Caroline Mimbs Nyce](https://www.theatlantic.com/technology/archive/2024/08/why-does-all-ai-art-look-same/679488/)
* [Image-to-Image Translation Pre-Training (unimodal network)](https://arxiv.org/pdf/2205.12952)
* [CLIP (Contrastive Language–Image Pre-training)](https://openai.com/index/clip/): This seems to be more about connecting text and image for generation