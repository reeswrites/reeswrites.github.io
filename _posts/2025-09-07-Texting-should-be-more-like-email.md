---
layout: post
type: article
tags:
- Communication
- Design
title: Texting should be more like email
slug: texting-more-like-email
description: null
started_at: '2025-09-07 13:44:00'
---

When texting, we've all probably had the experience of texting someone about three different things and them only responding to one or two. As the conversation flows on, the third thing will be lost to the sands of time because scrolling is not a good experience in most texting applications. How could we fix this? Well for one, I think that we could learn a lot from email.

## Why Email?

Email is not perfect, but I think a lot of that is because of the mainly corporate usage of email as well as the lack of innovation on the form. This has left us with a largely archaic and needlessly formal way of communicating with people that the newer generations will likely not adopt as a primary form of communication.

For one, there are so many features from email that I think that text messaging could benefit from; to name a few:
1. Subject field
2. Auto-replies (out of office replies)
3. Snoozing threads
4. Organizing threads (tagging/starring, archiving/deleting)
5. Marking messages/threads as urgent
6. Drafts

However, beyond features, I think there are some things that I think make a more email-esque model of communication (threads-centric) better for daily communication in ways that I will detail below.

### The Inbox as a TODO List

I don't mean that you should view your texts as items on a TODO list, but in some ways, that's what it is. [Inbox Zero](https://www.techtarget.com/whatis/definition/inbox-zero) and [Managing your inbox like a to-do list](https://front.com/blog/how-to-manage-your-inbox-like-a-to-do-list) showcase how to be an effective communicator.

When you open someone's text messages, you kind of have to commit to answering all the various threads of conversation, otherwise you might forget to answer something/miss it. I think that isolating these threads reduces the pressure on someone to respond all at once and can actually allow you to get responses in a more timely manner (on the things that actually matter at least).

You can mark things as unread on some messaging platforms, which helps you read and not respond right away, but that doesn't really help the problem of all or nothing responding.

### Threads As A Better Way Of Modeling Conversation

I love text threading, but I don't think any contemporary messaging app goes far enough. Except for email that is.

Threads are lovely because they can be atomic units of conversation; each thread with its own topic that is self-contained and contains information only relevant to that particular topic.

How do messaging apps handle threading now?
* iMessage and Slack have threads but are still situated in the general conversation which is not a bad approach, but could be better
* Facebook Messenger just has replies to messages which keep chronology and situation in general conversation, but in a way that gets quickly hard to follow

Conversation is branching and meandering. I think that having an interface that allows you to select messages from a thread and bring it into a new thread would be very beneficial.

You could manage multiples drafts at a time for different threads. You could answer to a more urgent topic like what's for dinner while ignoring one that is simply asking you to read an article and let them know your thoughts.

Not all group chats would benefit from threads like this, but anything having to do with planning absolutely would. For instance, muting threads rather than the entire group conversation would really be beneficial.

I think that also having a subject field would help contextualize threads better to you when revisiting it to respond. Like in the ChatGPT interface, perhaps topic modeling could be used to create a subject field if the users don't set one. I think it would also be nice if either user could update the subject at any time to reflect potential changes of the thread's purpose over time.

### The Case For Better Organization Of Text Messages

In texting applications, threads are not very searchable. You'll just have to remember what one of the messages was in the thread for you to be able to find it. But what if the threads were named? Does this sound familiar? Email subjects! Subjects can be incredibly powerful meta information about the thread. They can summarize the discussion topic in only a few words making it easier to remember and search for later.

The initial view of the application could be the same, with lists of people and the number of unread messages/threads you have with that person. However we could also add a more general inbox with all ongoing threads as to reduce the number of clicks needed to respond to people, but also to increase your visibility into ongoing threads of conversation.

With a person you will have multiple threads going at once, so when clicking into a person you can see the on going threads that are unread or pinned/starred

Instead of/in addition to pinning a person, you could pin a specific thread with a particular person.

## Implementation

This could easily be its own communication app as well, but I like to think of this approach as a new way of visualizing/modeling communication rather than being a new of communicating. In this way I don't want a new app to be created, but rather it be an add-on to existing messaging services, like RCS. Additionally, this view would have to be opt-in and maybe not the default since it would be a little bit different than what people are normally used to.

I think on Android this would be doable to implement by creating a new app to replace the stock messages app. It would then be possible to use RCS Message Replies and Subject Lines to allow for naming threads and organizing threads by contact. I am not an Android developer, nor do I really want to, so I will leave this up to anyone who wants to.

This wouldn't be possible on iOS as it stands today because there is no way to send SMS/RCS/iMessage messages from another app ([except in the EU](https://developer.apple.com/documentation/telephonymessagingkit)).

For now this article just stands as an intellectual exercise and thought experiment, but who knows? Maybe one day in the future this will be a standard view!