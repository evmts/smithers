---
"@smthrs/flow": minor
---

Adds `Flow.intersectCeilings(left, right)` and `Flow.ceilingWithin(inner, outer)` for capability ceilings in their
transported form, the groups of pattern text a credential or a message carries (`[]` unrestricted, a group with no valid
pattern denying everything). The intersection is exact and normalized, so equal authority has one form; containment
answers `false` whenever `CapabilitySet.within` can't prove it.
