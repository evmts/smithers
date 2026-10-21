---
"@smthrs/platform-node": patch
---

Use one scoped HTTP/1.1 provider transport for Node hosts. Repair a pre-header connection/session failure or fatal TLS record-corruption error once on a fresh pool; preserve cancellation and streamed-body failure behavior. A Node model host passes the transport as `HostModel`'s `fetch`; the `NodeHost` bundles provide no `FetchHttpClient.Fetch`, so a fetch a composition injects keeps carrying its requests. Each provider request logs `platform-node.provider-fetch` at debug level with its origin.
