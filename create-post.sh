#!/bin/bash
# file: create-post.sh
# author: Rees Draminski
# Creates a new Jekyll Markdown file for an article.

# get today's date in YYYY-MM-DD format
today=$(date +'%Y-%m-%d')

# get the article title from user input
read -p "Enter article title: " title

# get the article description from user input
read -p "Enter article description: " description

# get slug for the article permalink
read -p "Enter article slug: " slug

# TODO create tag selection menu

# put date and title together into tokens array to be joined together
declare -a tokens
tokens=($today $title)

# join the tokens together with Markdown file extension for filename
# https://stackoverflow.com/questions/1527049/how-can-i-join-elements-of-a-bash-array-into-a-delimited-string
function join_by { local IFS="$1"; shift; echo "$*"; }
file_name="_posts/"$(join_by "-" ${tokens[*]})".md"

# create article Markdown file
touch $file_name

# write Jekyll YAML front matter to file
echo "---" >> $file_name
echo "layout: stub" >> $file_name
echo "category: Garden" >> $file_name
echo "tags: [\"\"]" >> $file_name
echo "title: \"${title[*]}\"" >> $file_name
echo "slug: $slug" >> $file_name
echo "description: \"$description\"" >> $file_name
echo "---" >> $file_name