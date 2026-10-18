---
"@smthrs/engine-store": patch
"@smthrs/flow": patch
---

A run parked under one build now resumes under the next when the rebuild only
moved declarations. The durable store used to compare a recorded plan byte for
byte, including each node's `declaredAt`, so any rebuild that shifted a
bundle's line numbers failed every parked run at wake with `plan_changed`.

A resume now compares the plan's digest: node ids, kinds, action tags,
schemas, tiers, effects, dependencies, edges and callback source. Declaration
sites, the source revision and the page layout are never compared. Records
already in journals carry their sites inside the old comparison and resume
through the same rule; no row is rewritten. The first build's plan record and
its pages stand, and the rebuilt plan appends no pages of its own.

A real structural change still refuses the resume with `plan_changed`, and the
run settles `failed`.
