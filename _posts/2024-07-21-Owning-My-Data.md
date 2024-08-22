---
layout: post
type: article
category: Posts
tags:
- IndieWeb/Meta-blogging
title: Owning My Data
slug: owning-my-data
description: An exploration of the relative implementation complexity of collecting
  and visualizing my own data.
started_at: '2024-07-07 17:08:00'
updated_at: '2024-08-21 12:30:00'
---

## A Journey to Own My Data

To quote my [personal data index page](/data/overview/):

> “Owning your data” is an IndieWeb principle that aims to bring your data onto your own domain so that you can retain access to it over time and reclaim it from “data siloes”. I’m interested in data ownership and personal data centralization in part due to the fact that I think it is cool to be able to curate your own data and choose to present it if/how you wish. When data is being held by some other company, app, or website, you’re stuck with their presentation layer and their analytics. But also discoverability is mostly contained within that website. You could always link back to those kind of services from your own website but having people leave your website to go to another website is always kind of a hard sell.

In this article I will detail my various data processes that I used to download and reformat my data from various services so that I could own it and display/visualize it on my site. I am usually all for [open-sourcing my software](https://github.com/reeshuffled/), but I don't think that I'll be open-sourcing it because the system I've created only really makes sense to me, but also I think that most of the fun of this journey is writing your own code. Also it would commit you to my naming conventions for fields which are purely aesthetically based.

I will detail some code here where I think its necessary, but if you ever have any questions, you can always reach out to me via email rees.draminski [at] gmail [dot] com.

## Implementations

### [Swimming Times](/data/swimming-times) 
Source: USA Swimming  
Complexity: Easy

* Technically very easy because it was all just manual effort
* I did have to write some code to normalize field values but that was very easy and I can change it if I ever need to
* This is the only data source that I have so far that will never need updating. I guess I could start swimming in a Masters League.
* https://data.usaswimming.org/datahub/usas/individualsearch Individual Times Search type in a name, search, clcik on right person
* go through years and copy and paste into an Excel spreadsheet and save as .CSV
* I thought I was going to use SwimCloud and scrape from their site but it turned out they didn't even really have a lot of my data, so on I whim I looked up USA Swimming archive and found the DataHub

### [Records Owned](/data/records)
Source: Google Sheets  
Complexity: Easy

* Instead of trying to get my data from Discogs I just keep my own sheet
* The hardest part is data entry
* It has all the data that I need or want to remember and it is private (as private as Google Sheets can be that is)
* This means that I just download the Sheet as a CSV, drop fields, and normalize field names and then I'm good to go

### [Music Listened](/data/listening)
Source: Last.fm  
Complexity: Easy

* I listen to Apple Music and Soundcloud the most and occasionally YouTube so I use the [iOS Last.fm app](https://apps.apple.com/us/app/last-fm/id1188681944) and [Web Scrobbler Chrome Extension](https://chromewebstore.google.com/detail/web-scrobbler/hhinaapppaileiechjoiifaancjggfjm?hl=en-US) in order to scrobble to Last.fm
* I used [Last.fm to CSV by Ben Foxall](https://benjaminbenben.com/lastfm-to-csv) to download my scrobbling data without having to mess with an API or requesting a data export from Last.fm
* Had to convert to JSON with DictReader and pass my own header for the CSV 
* The hardest part was grouping song scrobbles together
* I am not super proud of the following code, but I think that it gets the job done.
    * If you're using `json.dumps()` make sure to set `ensure_ascii=False` (otherwise it will automatically escape Unicode characters), I lost many braincells trying to debug this minor detail

```python
# convert data from CSV to JSON
listening_data = list(
    csv.DictReader(
        lastfm_file.splitlines(),
        # specify header
        fieldnames=["artist", "album", "song", "scrobbled_at"]
    )
)

grouped_scrobbles = {}
for scrobble in listening_data:
    # define artist
    artist = scrobble["artist"]
    if artist not in grouped_scrobbles:
        grouped_scrobbles[artist] = {}

    # define album
    album = scrobble["album"]
    if album not in grouped_scrobbles[artist]:
        grouped_scrobbles[artist][album] = {}

    # define song
    song = scrobble["song"]
    if song not in grouped_scrobbles[artist][album]:
        grouped_scrobbles[artist][album][song] = 0

    # increment song scrobble count
    grouped_scrobbles[artist][album][song] += 1

# get list of songs with metadata + scrobbles
scrobbles_by_song = []
for artist, albums in grouped_scrobbles.items():
    for album, songs in albums.items():
        for song, scrobbles in songs.items():
            scrobbles_by_song.append({
                "artist": artist,
                "album": album,
                "song": song,
                "scrobbles": scrobbles
            })
```

### [Books Read](/data/books-read) and [Books Owned](/data/books-owned)
Source: Goodreads  
Complexity: Easy

* I do a [Goodreads Data Export](https://help.goodreads.com/s/article/How-do-I-import-or-export-my-books-1553870934590) which yields a CSV file which I convert to a Python dictionary
* Have to do a lot of renames because field names are in Plain english so I convert them to snake_case
* They give you a lot of fields so I drop a lot of them
* I group by read status
    * I used to have owned books in Libib but now just have it as a "shelf" in Goodreads so I check for that shelf to keep a list to save to a separate owned books section
    * I also drop the to read section because I don't like how that counts on Goodreads toward your total book count

### [Beers Drank](/data/beer)
Source: Untappd  
Complexity: Easy (but costs money)

* I really like having this data, especially if Untappd for whatever reason goes away, but it does suck that they [paywall data exports](https://help.untappd.com/hc/en-us/articles/360034506171-Where-can-I-find-the-Exportable-Data-feature-). They provide some analytics on their site/app, but it doesn't have everything that I would want.
* Untappd has an API, but they aren't onboarding any new users, so the main non-paid option is to scrape their site or RSS feed
    * [Posting Untappd Checkins to Mastodon (and other services)](https://shkspr.mobi/blog/2023/03/posting-untappd-checkins-to-mastodon-and-other-services/)
    * [Owning my Untappd content](https://boffosocko.com/2020/02/22/owning-my-untappd-content/)
* The Untappd Insiders program was only $5.99 a month when I was doing it so I did it at [1,000 beers]({% post_url 2023-12-17-I-Drank-1,000-Beers %}) and just cancelled after a month, so I essentially just paid $5.99 to download my data, which is not great but still worth it in my mind
* The Untappd export is super clean so I don't even make any changes to it

### [Anime Watched](/data/anime)
Source: MyAnimeList  
Complexity: Medium

* I couldn't find export through the UI, but I Googled it and found it fine: [Export Anime List](https://myanimelist.net/panel.php?go=export)
* The export is in XML which was weird and a first for me
* If you've been on MAL you know that by default anime are displayed under their Japanese title and the English title is shown as an alternative title, this is the same in your data download
    * Luckily MAL has an API, so I just had to get a MAL API key (which isn't really that hard) in order to call their /anime/{id}/ endpoint to get alternative_titles.
* I change field names, drop unnecessary fields, normalize some field values, and group by watch status

### [Movies Watched](/data/movies) 
Source: Letterboxd  
Complexity: Medium 

* The Letterboxd download is really easy (just [request your account data](https://letterboxd.com/settings/data/)) but for whatever reason they split out the data into multiple files so your movie rating and review are in separate files
* I normalize field names and drop some fields but that part isn't super involved
* I had to create a composite join key with Movie Name and Year that allows me to join the data together so that I can have it all in one JSON

### [Lifting Workouts](/data/lifting)

Source: Calendar  
Complexity: Medium-Hard

* I track my lifting workouts in my calendar because I track when I go to the gym on my calendar
    * I list exercises, sets, reps, and weight in the event description
* I download an .ics file from Google Calendar and parse it with the [icalendar](https://icalendar.readthedocs.io/en/latest/) Python package
    * .ics parsing is kind of slow so might have to look into a different package
* The hard part was accounting for subtle variations in my notation format that happened as it slowly evolved over time
    * I would have sets, reps, weight, and notes in different order or with different delimiters which made it annoying to parse

### [Cardio Workouts](/data/cardio)

Source: Apple Workouts  
Complexity: Medium-Hard

* It's not that the data is hard to manipulate, it's just hard to get off your phone
    * There is an [export option](https://support.apple.com/guide/iphone/share-your-health-data-iph5ede58c3d/ios)
    * You could also pay for an [app that does Health data auto-export](https://www.healthyapps.dev/)
* The other hard part is that the export file is a huge XML file, like my last file was 864MB so it takes a long time for xmltodict to parse, but it seems like there are other options
    * [How I Used the lxml Library to Parse XML 20x Faster in Python by Nick Janetakis](https://nickjanetakis.com/blog/how-i-used-the-lxml-library-to-parse-xml-20x-faster-in-python )
* There's a lot of other health data but I wanted Workout data so that slimmed the file down
* I un-nested some data, dropped some fields, normalized field names, and converted datetimes into a different format as well
* This is just Apple Fitness, but I want to merge it with my workout lifting data that is just stored in my calendar events so I can keep track of exercises with sets and reps.

### [Daily Steps](/data/steps)

Source: Apple Health  
Complexity: Hard

* Apple Health polls Apple Watch/iPhone pedometer so there's no total step count, you have to sum each reading for the day
    * You have to also filter the records by source name, otherwise you could be adding Apple Watch and iPhone step counts together
        * [Source](https://www.reddit.com/r/AppleWatch/comments/184983x/why_does_my_health_app_shows_different_amount_of/)
* Had to switch to lxml to read XML faster in my data processing script
    * Thanks [Nick for your article](https://nickjanetakis.com/blog/how-i-used-the-lxml-library-to-parse-xml-20x-faster-in-python) on lmxl in Python
* Parsing + summation code definitely inspired by [Oliver's article](https://medium.com/@oliver.lovstrom/unlocking-the-unseen-health-data-apple-health-reveals-your-most-active-day-and-more-5aaa070ae01e) and [John's article](https://www.johnwmillr.com/exporting-apple-health-data/)

```python
from datetime import datetime
from collections import defaultdict
from lxml import etree

# parse XML with lxml
tree = etree.parse(file)

# dict<date : str, step_count : int>
daily_steps = defaultdict(int)

# go through step count records
for record in tree.getroot().xpath("Record[@type='HKQuantityTypeIdentifierStepCount']"):
    # get date of step record
    date_obj = datetime.strptime(
        record.get("startDate"), 
        "%Y-%m-%d %H:%M:%S %z"
    ).date().isoformat()
            
    # normalize Rees’s Apple\xa0Watch => Rees's Apple Watch
    if "Apple Watch" in unicodedata.normalize("NFKD", record.get("sourceName")):
        # add steps to daily total
        daily_steps[date_obj] += int(record.get("value"))
```

### [TV Watched](/data/tv)
Source: Trakt.tv  
Complexity: Hard

* You can export Trakt.tv data if you have money but they make you pay yearly so I didn't want to do that
* Luckily they have a free API which I was able to use, you just have to [create an API app](https://trakt.tv/oauth/applications/new) with your account
* There are multiple Python API wrappers but they are all kind of confusing to use partially because of interface but also because generally Auth for the Trakt API is kind of complicated (or at least was for me to try to wrap my head around)

```python
# set auth method to device authentication
import trakt.core
trakt.core.AUTH_METHOD = trakt.core.DEVICE_AUTH

# authenticate via device auth
from trakt import init
init(
    client_id=os.environ.get("TRAKT_CLIENT_ID"),
    client_secret=os.environ.get("TRAKT_CLIENT_SECRET"),
    store=True
)

from trakt.users import User
from trakt.tv import TVShow, TVEpisode

my = User(os.environ.get("TRAKT_USER"))

data = []
for show in my.watched_shows:
    # get full show information from Trakt API
    full_show = TVShow(show.title, show.ids["ids"]["slug"])

    # store all seasons
    seasons = []
    for season in full_show.seasons:
        season_data = {
            "season": season.season,
            "watched": [],
            "episodes": len(season.episodes)
        }

        # find season watch data
        season_watch_data = next(
            (x for x in show.seasons if season.season == x.season), 
            None # default value
        )

        # add episode watch data if season is watched
        if season_watch_data:
            for episode in season_watch_data.episodes:
                season_data["watched"].append({
                    "number": episode.number,
                    "watched_date": episode.last_watched_at
                })

        first_aired_at = None
        if len(season.episodes) > 0:
            first_aired_at = TVEpisode(
                show.ids["ids"]["slug"],
                season.season,
                season.episodes[0].number
            ).first_aired
            
        # only add season data if defined information and has aired
        if (season_data["episodes"] > 0 and first_aired_at):
            seasons.append(season_data)
            
    data.append({
        "title": show.title,
        "year": show.year,
        "seasons": seasons
    })

    # sleep to prevent rate limiting issues
    sleep(randint(1, 3))
```

## What's Next?

* Going to add lifting workouts to display alongside cardio workouts (DONE)
* Develop Web Components so each data page has a Gallery and Table view (kinda like Notion)
* I will probably switch back to Libib for cataloging my books
* Spending might be interesting to do, with percentages for actual value masking
    * % saved vs spent, spend categories, merchants
* I thought about adding time spent analysis from my calendar, but I have been cataloging that less in order to be more in the moment