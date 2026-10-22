---
"@smthrs/flow": patch
---

Register `Action.EffectKeyUnavailable` as a `bug` fault so classification preserves
its stable error tag when a write runs without a durable dispatch identity.
