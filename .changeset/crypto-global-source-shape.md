---
"@smthrs/crypto": patch
---

Preserve standard global names in callback resume shapes after resolving local bindings, distinguishing fetch from eval while retaining minifier invariance. Uses the library catalog's existing @smthrs/crypto identity implementation. Exact-source digests stay unchanged; older normalized persisted plan identities involving globals may refuse resume as plan_changed and require the original build or a new run.
