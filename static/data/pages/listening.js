---
layout: none
permalink: /static/data/pages/listening.js
---
{%- comment -%} Full data for pages/data/listening.html (see _includes/page-data.html). {%- endcomment -%}

{%- capture fill_0 -%}{% include rows/listening-table.html items=site.data.media.music.scrobbles %}{%- endcapture -%}
window.PAGE_FILLS = {
    "#myTable tbody": {{ fill_0 | jsonify }},
};

