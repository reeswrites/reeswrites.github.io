# reeshuffled.github.io

The posts and pages that make up my Jekyll site.

1. Install rvm `rvm install "ruby-3.3.4" --with-openssl-dir="$(brew --prefix openssl)"`
* https://github.com/rvm/rvm/issues/5254
* Use whatever Ruby version https://pages.github.com/versions.json
2. Run `rvm use 3.3.4`
3. Run `bundle install` for Ruby deps

Run `bundle exec jekyll serve` or `pipenv run start` to build locally.

## To Run Jekyll Utilities

1. `pipenv shell`
2. `pipenv install`
3. `python jekyll_utils.py`