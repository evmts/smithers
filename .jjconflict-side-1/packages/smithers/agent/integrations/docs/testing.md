---
title: "Testing"
description: "Local GitHub fixtures, durable replay, and opt-in live tests."
---

Run `pnpm --filter @smthrs/integrations test`. The suite uses local HTTP
fixtures for GitHub transport, shared channel verification and replay,
and real SQLite storage for durable crash recovery.

Every request goes over the real `FetchHttpClient.layer` to those fixtures,
including the failures a server can produce: a 5xx, a stalled body, a
redirect to another origin. A transport fault no server produces on demand,
such as a rejection whose message quotes the token, is a test `HttpClient`
service provided in place of the real one. Nothing patches `fetch`.

Retries are the flow engine's, so they are tested on it. `faultingTransport` in
`test/Http.ts` answers the requests a test picks with a refusal, such as a 429
with `Retry-After`, sends the rest to the fixture, and lists every request the
client made, so a test counts attempts and the gaps between them. The
write-back resume suite crashes the SQLite engine between two attempts and
checks the resumed run still waits the journaled `retryAfterMillis` and writes
once.

The opt-in `GitHubLive.test.ts` needs a test repository and GitHub credentials.
Run a single file with `--coverage.enabled=false`; the full suite retains its
coverage thresholds.
