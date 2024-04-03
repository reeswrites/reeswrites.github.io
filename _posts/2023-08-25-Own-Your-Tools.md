---
layout: article
tags:
- Maintaining a Second Brain
title: Own Your Tools
slug: own-your-tools
description: You should own your tools, and why I don't (yet).
started_at: 23-06-2023 21:10:00
category: Garden
---

<style>
p + div  {
    margin-top: 15px;
}
</style>

## Background

Awhile ago, I stumbled upon a great article of which a lot of the points really resonated with me. I'll quote some of the ideas that stuck out to me the most. In this article, I am going to go into detail on why I fundamentally agree with the idea of owning your own tools, and also why I am currently not in the process of doing so.

<blockquote class="quoteback" darkmode="" data-title="Build tools around workflows, not workflows around tools" data-author="Linus Lee (@thesephist)" cite="https://thesephist.com/posts/tools/#workflows--tools">
        <span>
            Each person’s mind works a little differently, and each person remembers and processes information a little differently. I think we all work at our best when we work with tools that fit how our minds work.
        </span>

        <footer>
            Linus Lee (@thesephist)
            <cite> 
                <a href="https://thesephist.com/posts/tools/#workflows--tools"</a>
            </cite>
        </footer>
</blockquote>
    
<script src="https://cdn.jsdelivr.net/gh/Blogger-Peer-Review/quotebacks@1/quoteback.js"></script>

I really agree with this, and while with the rise of Notion and other tools that offer a foundation of customization and creativity, I think that those tools are still fundamentally locked into a certain paradigm, and anyone outside of that paradigm is either sentenced to creating hacky workarounds for their workflow to come to life, or they have to use something else.

<blockquote class="quoteback" darkmode="" data-title="Build tools around workflows, not workflows around tools" data-author="Linus Lee (@thesephist)" cite="https://thesephist.com/posts/tools/#own-your-load-bearing-tools-of-life" style="margin-top: 10px">
        <span>
            My productivity tools, especially my notes and contacts, are the load-bearing tools of my life. If they break or disappear, it’ll take a long time and a lot of effort for me to rebuild those same workflows and tools, so it’s important that they’re reliable, and that I can depend on them working for me for a long time (measured in years and decades, not quarters).
        </span>
        
        <footer>
        Linus Lee (@thesephist)
            <cite>
                <a href="https://thesephist.com/posts/tools/#own-your-load-bearing-tools-of-life">https://thesephist.com/posts/tools/#own-your-load-bearing-tools-of-life</a>
            </cite>
        </footer>
</blockquote>
    
<script note="" src="https://cdn.jsdelivr.net/gh/Blogger-Peer-Review/quotebacks@1/quoteback.js"></script>

I think that this idea in particular (loosely) ties back to the idea of owning your data. I most recently have seen this gaining momentum through the [IndieWeb](https://indieweb.org/own_your_data). Linus's article was written before the advent of LLMs, so I'm not sure what he'd have to say, but I certainly have concerns about AI/LLM data source mass harvesting for some of my notes or documents stored in cloud services.

## Tools That I’ve Created

### My website

I don't really know if this counts, but I wanted to include it because it is something that I've done myself and retain a lot of ownership over. I don’t use Wordpress or any kind of CMS. I write Markdown or HTML and publish it on GitHub and through GitHub Pages my website is generated via Jekyll and published. GitHub Pages is free and I pay for my domain via Google Domains ([which is now owned by Squarespace](https://support.google.com/domains/answer/13689670?hl=en)). I use [Cloudinary](https://cloudinary.com/) as my CDN to host my pictures since it is [not great practice to upload binary files to Git](https://robinwinslow.uk/dont-ever-commit-binary-files-to-git).

I have no interest in owning more of this process at this moment, but I may explore options eventually because the Jekyll that they run is pretty locked-down in terms of allowed extensions. I could explore other generator options apart from Jekyll as well, but I have no complains, so if it ain't broke, I won't fix it. I am not a person that chases the evergreen. So if anything, I would start to compile the Jekyll site on my computer and just upload the static files to GitHub pages or my own server in the future.

### Free-Form Notes via [scratchpad](https://github.com/reesdraminski/scratchpad)

Scratchpad is an application that I developed awhile ago at this point inspired by [RapidTable's Notepad application](https://www.rapidtables.com/tools/notepad.html). I really liked the skeuomorphic notepad design, but wanted to pare down the interface elements to make it more minimal. I also added a note tab feature to allow me to make new notes and switch between notes.

I used to use this application a lot, especially when drafting or doing quick research on my laptop, and then used Notion for any kind of long-term storage or more in-depth knowledge management tasks. However, ever since I've used Notion less and Apple Notes more, Notes has eaten the share of the times that I would use Scratchpad. The main reason is because of the syncing capabilities, something that I don't have the infrastructure to add into Scratchpad. I don't wanna roll my own DB and authentication stuff, but I might want to in the future just to fully own my notes and be able to add some features that Apple Notes doesn't have.

While there is the ability to switch between notes in Scratchpad, there is no mechanism by which to organize or group notes. I think that if I were to build out Scratchpad, I would add folders/tags as a feature. Additionally, while there is support for rich-text formatting (text formatting, linking, etc.), there is no Markdown support. I've played around with the idea of having a Markdown editor where your cursor line shows in Markdown text format, but everything else is rendered normally, but I wasn't able to get it working, so I put that idea on freeze.

### TODOs via [dodue](https://github.com/reesdraminski/dodue)

Dodue is an application that is founded on the idea of a fundamental separation of a "due" date and a "do" date. I found that task apps had a deadline date that you could attach to a task, so you could have it do the "do" date or the "due" date, but you had to choose and couldn't store both. I think that having the due date is obviously so important because if you have something that is time-sensitive you should know when it is actually due. However, for me, the do date is just as important because that is how I was planning my days. I would see what I planned on doing that day and when the task was actually due to see if I could push it back a day or two if necessary, it really helped with task prioritization.

This is again an application that I used to use more when I was doing a lot more things on my laptop during school. Since there was no sync capabilities, I would jot down task stubs in my Apple Notes, and then when I got a chance to sit down on my laptop I would manually enter the tasks into Dodue. This ingest process wasn't too time/effort prohibitive because it wasn't that much work to just copy and paste tasks and set dates in my application. I added a lot of keyboard shortcuts to Dodue so creating and adding tasks was a breeze.

Once I graduated and had less tasks that were time sensitive I stopped using this application. I would maybe revisit this application to give it cross-device sync and an enhanced mobile view, but that would only be if there was interest in the application. This is an example of a project that I am glad that I built, but have ultimately grown out of using it for the most part. I just use Apple Notes for tracking my TODOs these days and that is about as powerful/flexible as I need it to be.

### Calendar Analytics via [cal-analyze](https://github.com/reesdraminski/cal-analyze)

This is the most recent of my applications on this list that I've created for myself, and one that isn't really designed for daily use. I could foresee it being used weekly/monthly, but I just use it at the end of year to do my Year Wrapped (see: [My 2022 Wrapped]({% post_url 2022-12-25-My-2022-Wrapped %})). I can see how and who I'm spending my time by looking at event descriptions and seeing how I tagged events.

This is only a stopgap application because my real goal is to build my own calendar app. This is something that I've always wanted to do, but I'm not sure if I'll get around to it in the next few years. I have such lofty ideas for the kinds of things that would be in the application that I'm not really sure where to start. I've been using Google Calendar and syncing onto my iPhone with the Apple Calendar app, and I don't have any complaints about the functionality, it's just that there's no innovation. I want the create a calendar app that both fits my life/use cases, but also allows a person to track a lot of data and contextualize it.

## Difficulties with Owning Your Tools

There is no such thing as a free lunch, and self-hosting can get expensive. You could maybe score AWS credits somewhere and host for a little while for free, but eventually it’ll run out, even if you try to be as efficient as possible. Additionally, I feel like vendor lock-in is antithetical. I think that dockerizing your apps could help avoid that lock-in and let you switch in between services quickly depending on quality of service, price, etc.

For me, the effort of setting up cross-device sync and authentication via a database was always just above the level of effort that I wanted to put into a personal project. It is time and energy that I could be putting elsewhere. For these projects, most of them were for productivity, of which I am passionate about, but I am not interested in optimizing it to the nth degree. Although cross-device sync has eluded me all this time, that isn't to say that I haven't tried getting around it. My hacky solution a few times has been adopting the URL data sharing method. This was inspired by [Itty Bitty](https://github.com/alcor/itty-bitty) and I remember being blown away when I first came across it. In short, I stringify a JSON object that represents application data/state and then use [LZMA compression](https://en.wikipedia.org/wiki/Lempel%E2%80%93Ziv%E2%80%93Markov_chain_algorithm) to reduce the number of characters and then attach the data as a URL parameter. This URL could be shared across devices/people to allow the data to be transferred to another device.