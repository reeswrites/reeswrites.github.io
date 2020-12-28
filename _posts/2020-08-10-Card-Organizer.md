---
layout: project
title: Card Organizer
categories: [Projects, Iota]
repo_name: "reesdraminski/card-organizer"
---

Card Organizer is a JavaScript library to create organizable cards that can be serialized into a form's hidden input.

The reason that this can be serialized into a form's hidden input is that the original purpose of this library was to be used alongside Django. Instead of using a Many-to-Many relationship, it was easier to simply input and output the id's of the objects.

I was commissioned to do this project because it was fairly UI heavy, the cards themselves weren't super hard to implement, but a lot of the operations such as drop-n-drop/general re-ordering were a bit tricky to implement.

When I was doing this project I thought I was done, until I actually tested on my phone. I had been using the mobile simulator in Chrome's DevTools window, but I quickly realized that iPhone's drag and drop functionality was a lot different than desktop. I had to scramble to find a polyfill, which was hard to find one that did exactly what I wanted to do, but once I found it, I was just able to drop it in and it worked perfectly.