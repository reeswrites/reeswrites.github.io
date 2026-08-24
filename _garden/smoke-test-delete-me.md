---
title: Smoke Test Note
slug: smoke-test-delete-me
description: Temporary fixture to verify the garden collection builds.
maturity: seedling
planted: 2026-08-23
tended: 2026-08-23
tags: [Testing]
has_ai_spans: true

# NOT a real note. This is the Playwright fixture for the garden collection
# (tests/garden.spec.js), kept in-tree so the AI-attribution assertion — which
# ADR-0001 makes a build failure — always has something to assert against.
#
# `published: false` keeps it out of every ordinary build, so it cannot reach
# the live site. The test server passes `--unpublished` to bring it back.
published: false
---

Fixture note. It exercises the collection, layout, index and feed, and is
excluded from production builds by `published: false`.

> [!ai] Claude · pasted 2026-08-23
> This paragraph stands in for a pasted assistant passage. It should render with
> the attributed AI treatment rather than as an ordinary block quote.

An ordinary quote, for contrast:

> This one is a normal block quote and must NOT pick up the AI treatment.
