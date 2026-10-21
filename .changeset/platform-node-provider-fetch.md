---
"@smthrs/platform-node": patch
---

`EgressHttpClient.providerFetch(environment)` is a `fetch` for a Node model
host's provider calls, to pass as `HostModel`'s `fetch` option: Undici's `fetch`
over its own egress pool, speaking HTTP/1.1 only. With Node's own `fetch`, a
provider edge that tore an HTTP/2 session down left every later call failing
`ERR_HTTP2_INVALID_SESSION` until the process restarted. `dispatcher` takes
`allowH2` and `connect` pool options.
