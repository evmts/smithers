---
"@smthrs/engine": minor
"@smthrs/engine-store": patch
---

Keyed sealed action keys name their encoding. `FlowEngine.keyEncodings` is now `[3, 2, 1]`: new keys take encoding 3, which writes `keyEncoding: 3` into the key, so the next change to the derivation can never be mistaken for this one. Encodings 2 and 1 stay derivable, and a run parked across the upgrade replays the sealed steps it recorded under them. A cross-run cache row written under an older encoding misses once.
