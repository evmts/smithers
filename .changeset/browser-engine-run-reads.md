---
"@smthrs/platform-browser": minor
---

A tab reads the engine's runs: `BrowserEngine.inspect(runId, { afterSeq,
limit })` and `BrowserEngine.list({ limit, cursor, roots })` post the new
`Inspect` and `List` requests, which name no flow, and the leader answers from
its engine's `RunInspection` (`@smthrs/engine-store`), redacted and cut to 16 KiB.
The tab decodes each reply with its own declaration and never loads
`@smthrs/engine-store`. An unknown run is refused with
`@smthrs/engine-store/RunNotFound`, and an unreadable reply as `SchemaError`.

The engine now provides `RunInspection` to registered flows (it is part of
`BrowserRuntime.Host`), and `BrowserRuntime.Options` takes the `flows` whose
runs render through their own schemas; `run` passes the flows it serves. Each
`Inspect` the leader answers is a `run.inspect` span and log line with the
host, outcome, event and byte counts, clipped values and duration, never a
value.
