# ADR-0001 — Thoughts are a collection, not a post kind

Status: proposed · 2026-08-23 (renamed from "the garden" to "thoughts" before anything shipped)

First ADR in this repo. Counterpart to `exo-me` ADR-0015, which decides how a note earns its
way here; this one decides what it becomes on arrival.

## Context

`exo-me` is building a triage surface over 2,019 imported personal notes, of which **577**
are publishable candidates — the owner's own voice, more developed than a fragment, past a
fail-closed privacy wall. Notes that pass get published here.

This site already has seven post kinds (`article` 158, `stub` 73, `notes` 30, `list` 26,
`project` 13, `essay` 12, `recipe` 10) and one shape for all of them: a dated file in
`_posts/`, a permalink under `/posts/:title/`, an entry in the feed, a place in the
chronology. That shape encodes an assumption — **a post is finished and it happened on a
day** — which is true of everything published so far and false of what is arriving.

A thought is the opposite on both counts. It is deliberately unfinished, it is expected
to be revised in place, and its interesting date is *last tended*, not *published*. Filing
577 of them into a dated chronology would be filing them under a fact that is not the point.

There is also a volume problem. A triage session can plant twenty notes in an afternoon.
`_config.yml` sets `feed.posts_limit: 25`. One good session would flush the entire feed of
essays and replace it with seedlings.

## Decision

**A new `thought` collection**, `_thought/*.md`, `permalink: /thought/:name/`, with a
`maturity` axis of `seedling` → `budding` → `evergreen`.

**Named "thoughts", not "the garden", and served from `/thought/`.** Two reasons, and the
second is load-bearing. "Garden" is a term of art that asks the reader to already know the
digital-gardening convention, where "thought" says what the thing is to someone who has heard
of neither. And `/garden/` is **not a free namespace on this site**: it was used before, and
`everyday-things`, `pick-two-and-a-side` and `search-with-simplejekyllsearch` are live
redirects from it into `/posts/`. Reusing the path would have meant either breaking those or
reserving slugs against them forever. `/thought/` costs nothing and collides with nothing.

**Maturity lives in frontmatter, and that is not an inconsistency with ADR-0015.** That ADR
insists a durable human decision must live outside the regenerated body, because a generator
would erase it. It applies to the *gate*, whose queue is rebuilt on every run. It does not
apply here: once planted, a thought's file is human-owned, hand-edited and git-tracked, and
nothing regenerates it. Frontmatter is the correct store precisely because the body stopped
being disposable at the moment of planting. **The sidecar governs the gate; the file governs
the thought.** Keeping that boundary sharp is what stops the two stores from drifting.

**AI attribution renders, and its absence fails the build.** Thoughts may carry spans of pasted
assistant prose, marked upstream as block-quote callouts (`> [!ai] Claude · pasted <date>`).
The layout must render these as visibly attributed — distinct treatment, a machine-authored
label, the model and date from the header — so it is obvious at a glance which sentences are
not his. Frontmatter carries `has_ai_spans` so indexes can badge it too. A thought whose
body contains such a callout and whose page does not render the attribution is a **build
failure**, asserted in the Playwright spec, not a styling preference.

**Two audiences, two different answers about mixing.**

- **Feeds stay separate.** Thoughts are excluded from `jekyll-feed`'s main feed and get their
  own `/thought/feed.xml`. Someone subscribed for essays did not agree to watch seedlings
  appear.
- **`all_posts` mixes, behind a control.** Garden notes join
  `pages/writing/all_posts.html` as a toggle (posts · thoughts · both) rather than a
  walled-off section.

The asymmetry is deliberate: **a page is browsed with intent and can offer a control; a feed
is pushed and cannot.**

**Images are deferred, explicitly.** The first thought layout ships without asset handling,
because the corpus being planted from has **zero** images — they were lost in the upstream
protobuf decode years ago, and the 77 attachments that exist live only in a separate export.
Building an asset pipeline now would be building for a corpus that does not exist yet. Two
obligations make the deferral safe rather than merely postponed: frontmatter **reserves an
`images:` key from day one**, so adding assets later is additive rather than a migration of
already-planted files; and the planter **logs every dropped image**, so what was lost is a
queryable list rather than an archaeology project. The standing rule regardless: **never hold
a note because of its images** — plant it, omit what cannot be carried, record the omission.

## Consequences

- The repo grows its first collection, and `_config.yml` grows its first `collections:` key.
- `etl/sources/backlinks.py` scans `_posts/*.md` and `pages/**` today; it must scan `_thought/`
  too, or thoughts are invisible to the reverse-link index that `_layouts/post.html`
  consumes — a silent half-failure where the pages build fine and simply never link.
- New surfaces to build and test: `_layouts/thought.html`, a `pages/writing/thoughts.html`
  index grouped by maturity, a menu entry, the hand-rolled feed template (`jekyll-feed`
  generates for posts only), and the `all_posts` toggle.
- **The "my writing" menu is reordered** while gaining the entry: kinds above the divider
  (all · articles & essays · notes & lists · recipes · thoughts), tools for reading them
  below (graph · stats · topics). The old order interleaved the two.
- The bar for `_posts/` does not move. Thoughts are a *lower* bar on a *different* surface,
  and nothing in this decision authorises the gate to write into `_posts/`.
- `maturity` is a claim the site makes and nothing enforces. A seedling that is never tended
  stays a seedling forever and says so, which is honest, but the index will accumulate them.

## Alternatives rejected

- **Another post kind (`kind: thought`) in `_posts/`.** The cheapest option and the one the
  existing taxonomy invites — `stub` (73) already means something adjacent. Rejected because
  kind is a label on a shape, and the shape itself is what does not fit: a dated filename, a
  chronological position, and feed membership are all wrong for a note meant to be revised.
  A kind cannot opt out of them; a collection never had them.
- **Publish thoughts as drafts and promote by hand.** Preserves one pipeline, but
  `_drafts/` is a staging area for things that will become posts, and these are not becoming
  posts. It would also make every plant a two-step act, which defeats a triage surface whose
  value is deciding quickly.
- **Include thoughts in the main feed, capped.** Any cap that protects essay subscribers
  also starves thought subscribers, because one queue cannot serve two publication rhythms.
- **Render AI spans as ordinary block quotes.** They already *are* block quotes structurally,
  and the upstream machinery relies on that. But a quote from a book and a paragraph a
  chatbot wrote are different claims about a page, and only one of them is a claim about
  whose thinking the reader is reading.
- **Hold image-bearing thoughts until assets work.** Would hold notes for a property no note in
  the current corpus has, trading a real publication for a hypothetical fidelity.
