---
"@smthrs/patterns": major
---

A declared `DelegationChain` runs the plan its derisk loop settles on.
`DelegationChain.make` used to declare `maxDepth` placeholder ladders, each
handed the whole derisk outcome as its goal; a failing tier aborted the chain
instead of escalating; an exhausted ladder settled as success; and settle saw
only the last slot's output.

`make` now runs in two durable rounds. The first refines the goal and runs the
derisk loop, then hands the outcome to the execution round with `Flow.to`. The
execution round validates the derisked plan against the envelope, declares one
tier ladder per leaf the plan names, escalates when a tier fails or its review
rejects it, fails `leaf_failed` at the leaf's path when no tier settles it, and
hands review and settle every leaf output in plan order with the real
`deriskExhausted`. The flow's payload is `DelegationChain.Payload`
(`{ input, execution? }`); execution state whose derisk outcome is malformed
fails `derisk_failed`. Its error schema unions `DelegationError` and
`TrellisError` with the error schema each member flow declares, so a durable
engine journals all of them.

RC releases carry no stability commitment ([RELEASE_SUPPORT.md (MVP compatibility changes)](../RELEASE_SUPPORT.md#mvp-compatibility-changes)).
