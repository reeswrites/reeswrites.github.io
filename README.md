# reeshuffled.github.io

The posts and pages that make up my Jekyll site.

## Local Setup

1. Install [Brew](https://brew.sh/) (Mac)
1. Install `rvm`
   * https://rvm.io/rvm/install
2. Install Ruby
   * `rvm install "ruby-3.3.4" --with-openssl-dir="$(brew --prefix openssl)"`
   * https://github.com/rvm/rvm/issues/5254
   * Use whatever Ruby version https://pages.github.com/versions.json
3. Run `rvm use 3.3.4`
4. Run `bundle install` for Ruby deps
    * Remove Gemfile.lock if you want to try to update deps

## Running Jekyll

Run `bundle exec jekyll serve` or `pipenv run start` to build locally.

## To Run Jekyll Utilities

1. `pipenv install`
2. `pipenv run ${command}`: `clog`, `enrich`, `new`, `promote`, `stats`