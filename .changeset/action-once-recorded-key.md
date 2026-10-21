---
"@smthrs/flow": minor
---

`Action.once(name, effect, { key })` takes a write's key when its identity was chosen and recorded before the step ran,
such as a write id a device stored with its request, so the written object carries the id other code already knows it
by. With `key`, `once` needs no dispatch; without it, the key is still derived from the execution and the dispatch.
