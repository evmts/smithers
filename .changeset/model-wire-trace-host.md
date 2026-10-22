---
"@smthrs/model": patch
---

Replace implicit synchronous wire-trace filesystem writes with an optional WireTrace service. Provide WireTrace.layerFileSystem(path) over a host FileSystem when constructing the route to retain JSONL diagnostics. SMITHERS_WIRE_TRACE is no longer read implicitly. Default model calls run without filesystem access in browsers and Workers; timing remains on settle events, errors and spans.
