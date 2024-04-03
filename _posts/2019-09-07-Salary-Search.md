---
layout: project
title: Salary Search
categories: community-project
repo_name: umbc-sga/salary-search
---

Salary Search is an application that allows access to public salaries of UMBC employees for transparency.

## Why did I create this project?
I made this application when I was a Senator for the [UMBC SGA](https://sga.umbc.edu). I wanted to make this app after I saw the [UMD Diamondback](https://dbknews.com/) (University of Maryland, College Park's student newspaper) do a [similar project](https://salaryguide.dbknews.com/) for their school. I was very moved by the idea of transparency through public and accessible data, so I wanted to create my own version of it.

## Where is the data from?
The Diamondback sourced their data directly from institutional partnerships, on their website it says that the university provides them with this information via spreadsheet and they use this data to populate the webapp.

I wanted to move fast and not have to be bogged down by institutional bureaucracy, so I looked elsewhere to source my data. I remembered hearing somewhere that Maryland Government employees salaries were public information, and since UMBC is a Maryland public institution, that would mean that their data would have to be accessible somewhere. That is when I found the [Baltimore Sun Public Salary Records](https://salaries.news.baltimoresun.com/) page. This had all the information I needed in a well-formatted CSV file.

## Implementation Process
I edited the CSV file to only include people that worked at UMBC, and used [PapaParse](https://www.papaparse.com/) to parse the CSV file to JSON.

At first, the application only had search functionality, but something that I knew I wanted was the ability to "explore" the data, similar to how the Diamondback's was. So what I added was the "Explore Page" which shows a paginated list of all employee's salary data, sorted from highest paid to lowest paid.

I was even able to hook in the UMBC Directory Search API, so that I could get the positions of employees, or at least those of whom had manually entered it into the UMBC Directory.

Originally the application only held the latest year's salary data, but since then I have upgraded it to include data from 2013-present and shows employee's salary records in tables that shows the data over the years.

## Future Work
* Generating a JSON that has all of the data pre-sorted so that the client doesn't have to parse the CSV's
* Restricting directory searches to a single page of the Explore page
* Smart detection of employees who have changed their names and combine their entries