# 0019 — Node model provider transport

Date: 2026-10-20. Implementation choice under the lead's 19:30 transport-fix request.

Node hosts use `@smthrs/platform-node`'s single scoped `EgressHttpClient.providerFetch` implementation through Effect's fetch reference. Provider calls use HTTP/1.1 to avoid the observed persistent HTTP/2 session failure. Browser and Worker hosts retain their native transport; generic libraries import no Node code.

One pre-header connection/session failure may repair the pool and replay a reusable request once. Cancellation, streaming bodies, response-body errors and provider refusals do not trigger repair. Durable flows own subsequent retries. Pre-header loss is not proof that a provider POST did no work, so repair is not an exactly-once guarantee.

The old direct-global-fetch Node compositions are replaced. A local TLS record-corruption fixture reproduces the persistent wedge on Node 26.5/26.10: a fatal TLS error leaves the origin client dispatching through openStream/writeH2 against a destroyed session. Ordinary GOAWAY/teardown controls recover. HTTP/1.1 with one pre-header fresh-pool repair passes the same fault. [The repeat](../../bench/cerebras-load/RESULTS.md) measures real provider refusals, with 25/50 escalation stopped by the requested error threshold.
