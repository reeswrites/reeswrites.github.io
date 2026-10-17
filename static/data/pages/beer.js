---
layout: none
permalink: /static/data/pages/beer.js
---
{%- comment -%} Full data for /data/beer (see _includes/page-data.html). {%- endcomment -%}
{%- assign beers = site.data.beers.checkins | reverse -%}
{%- capture recent -%}{% include rows/beer-recent.html items=beers %}{%- endcapture -%}
{%- capture table_rows -%}{% include rows/beer-table.html items=beers %}{%- endcapture -%}
window.PAGE_FILLS = {
    "#recent-list": {{ recent | jsonify }},
    "#myTable tbody": {{ table_rows | jsonify }},
};
// Compact checkin data: [style, brewery, beerName, rating, date]
    const CHECKINS = [
        {% for beer in beers %}["{{ beer.beer_type | escape }}", {{ beer.brewery_name | jsonify }}, {{ beer.beer_name | jsonify }}, {{ beer.rating_score | default: "0" | times: 1.0 }}, "{{ beer.created_at | date: '%Y-%m-%d' }}", {{ beer.checkin_id | jsonify }}]{% unless forloop.last %}, {% endunless %}
    {% endfor %}
];
const BEER_MODAL_ITEMS = [{% for beer in beers %}{id:{{ beer.checkin_id | jsonify }},title:{{ beer.beer_name | jsonify }},brewery:{{ beer.brewery_name | jsonify }},brewery_city:{{ beer.brewery_city | jsonify }},brewery_state:{{ beer.brewery_state | jsonify }},style:{{ beer.beer_type | jsonify }},rating:{{ beer.rating_score | default: 0 | times: 1.0 }},review:{{ beer.comment | jsonify }},date:"{{ beer.created_at | date: '%Y-%m-%d' }}",abv:{{ beer.beer_abv | default: "null" }},ibu:{{ beer.beer_ibu | default: "null" }},beer_url:{{ beer.beer_url | jsonify }},flavor_profiles:{{ beer.flavor_profiles | jsonify }},venue:{{ beer.venue_name | jsonify }},venue_city:{{ beer.venue_city | jsonify }},venue_state:{{ beer.venue_state | jsonify }},serving:{{ beer.serving_type | jsonify }}}{% unless forloop.last %},{% endunless %}{% endfor %}];
