---
"@smthrs/plan": patch
"@smthrs/engine": patch
"@smthrs/engine-store": patch
---

A keyed sealed action whose success or error schema carries `Schema.brand` replays the outcome an engine recorded under `effect@4.0.0-rc.115` instead of running again. `Node.representationIdentity` now takes the schema and a version: version 2 (the default) is the identity written since `effect@4.0.4`, and version 1 restores each brand from the schema value as rc.115 wrote it. `FlowEngine.keyEncodings`, `KeyEncoding` and `ActionKeyEncoding` name the sealed key encodings, newest first; `Encoded.actionReplayKey` receives the dispatch's keys under every older encoding, and the SQL engine store replays a record found under one. Uses the library catalog's `@smthrs/flow` durable engine entry.
