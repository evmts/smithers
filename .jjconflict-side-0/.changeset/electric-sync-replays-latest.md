---
"@smthrs/effect-electric": patch
---

`ElectricCollection`'s `sync` stream now begins with the latest sync event for a subscriber that starts late. A shape
that Electric stopped before anyone listened (a 4xx on its first request) used to report nothing to a later
subscriber, so a connection indicator built after the collection could miss that sync had failed. Each new stream now
replays the one latest event, then follows as before.
