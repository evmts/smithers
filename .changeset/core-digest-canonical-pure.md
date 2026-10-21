---
"@smthrs/core": patch
---

`Digest.canonical` now throws `CanonicalError` with `code` and `path` for unrepresentable values and preserves its canonical bytes. It uses the library catalog's `@smthrs/canonical` entry directly, so no Effect runs.
