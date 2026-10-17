---
layout: none
permalink: /static/data/pages/all-posts.js
---
{%- comment -%} Post index for /posts/all/ (see _includes/page-data.html). {%- endcomment -%}
window.POSTS_DATA = [
    {% for post in site.posts %}
        {
            "title":       {{ post.title       | jsonify }},
            "description": {{ post.description | jsonify }},
            "url":         "{{ post.url }}",
            "type":        "{{ post.type }}",
            "content":     {{ post.content | strip_html | jsonify }},
            "date":        "{{ post.date | date: '%Y-%m-%d' }}",
            "tags":        "{{ post.tags | join: ',' }}"
        }{% unless forloop.last %},{% endunless %}
    {% endfor %}
];
